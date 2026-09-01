import { NextResponse } from "next/server";
import {
  getWallet,
  getWalletPrivateKey,
  acquireWalletNonceLock,
  releaseWalletNonceLock,
  touchWalletActivity,
} from "@/lib/wallet/manager";
import {
  getFullWalletBalance,
  toWalletBalanceRecord,
} from "@/lib/blockchain/balances";
import { estimateNativeTransferGas } from "@/lib/blockchain/gas";
import { executeTransfersSequential } from "@/lib/blockchain/transfers";
import {
  checkCollectAgainstRisk,
  resolveRiskSettings,
} from "@/lib/validation/risk";
import { writeAudit } from "@/lib/validation/audit";
import { saveTransaction } from "@/lib/database/client";
import { BOT_FEE } from "@/lib/blockchain/contracts";
import type {
  CollectPreview,
  DistributionItem,
  TransactionRecord,
  Wallet,
  WalletBalance,
} from "@/types";
import { generateId } from "@/lib/utils";
import { listWallets } from "@/lib/wallet/manager";

export const dynamic = "force-dynamic";

function serialize<T>(obj: T): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      treasuryWalletId: string;
      walletIds: string[];
    };
    const treasury = getWallet(body.treasuryWalletId ?? "");
    if (!treasury)
      return NextResponse.json({ error: "Treasury not found" }, { status: 404 });
    if (!treasury.enabled)
      return NextResponse.json(
        { error: "Treasury wallet disabled" },
        { status: 400 }
      );
    const ids = (body.walletIds ?? []).filter(
      (id) => typeof id === "string" && id.length > 0
    );
    const wallets: Wallet[] = listWallets().filter(
      (w) => ids.includes(w.id) && w.enabled && w.id !== treasury.id
    );
    const errors: string[] = [];

    const balances: Record<string, WalletBalance> = {};
    let totalBalance = 0n;
    let totalGasReserve = 0n;
    let safeCollection = 0n;
    const items: DistributionItem[] = [];

    const perTransferGas = estimateNativeTransferGas(1).reserveWithSafety;
    for (const w of wallets) {
      try {
        const full = await getFullWalletBalance(w.address);
        const rec = toWalletBalanceRecord(w.id, full);
        balances[w.id] = rec;
        totalBalance += rec.nativeUSDC;
        totalGasReserve += rec.gasReserve;
        const collectable =
          rec.safeCollectable > perTransferGas
            ? rec.safeCollectable - perTransferGas
            : 0n;
        if (collectable > 0n) {
          safeCollection += collectable;
          items.push({
            walletId: w.id,
            address: treasury.address,
            amount: collectable,
          });
        }
      } catch (err) {
        errors.push(`Failed to read ${w.label}: ${err instanceof Error ? err.message : ""}`);
      }
    }

    const estimatedGas = perTransferGas * BigInt(items.length);
    const treasuryBal = await getFullWalletBalance(treasury.address).catch(
      () => null
    );
    const finalTreasuryBalance =
      (treasuryBal?.nativeUSDC ?? 0n) + safeCollection;

    const preview: CollectPreview = {
      treasuryAddress: treasury.address,
      treasuryWalletId: treasury.id,
      items,
      totalBalance,
      totalGasReserve,
      safeCollection,
      perTransferGas,
      estimatedGas,
      finalTreasuryBalance,
      botFee: BOT_FEE,
      valid: errors.length === 0 && items.length > 0,
      errors,
    };
    const settings = await resolveRiskSettings();
    const risk = checkCollectAgainstRisk({ preview, settings });

    return NextResponse.json({
      preview: serialize(preview),
      risk,
      treasuryBal: serialize(treasuryBal ?? {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
