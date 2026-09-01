import { NextResponse } from "next/server";
import {
  getWallet,
  getWalletPrivateKey,
  acquireWalletNonceLock,
  releaseWalletNonceLock,
  touchWalletActivity,
} from "@/lib/wallet/manager";
import { getFullWalletBalance } from "@/lib/blockchain/balances";
import { estimateNativeTransferGas } from "@/lib/blockchain/gas";
import { executeTransfersSequential } from "@/lib/blockchain/transfers";
import {
  checkDistributionAgainstRisk,
  resolveRiskSettings,
} from "@/lib/validation/risk";
import { writeAudit } from "@/lib/validation/audit";
import { saveTransaction, listTransactions } from "@/lib/database/client";
import { BOT_FEE } from "@/lib/blockchain/contracts";
import type {
  DistributionItem,
  DistributionPreview,
  TransactionRecord,
} from "@/types";
import { generateId } from "@/lib/utils";

export const dynamic = "force-dynamic";

function serializeBigint<T>(obj: T): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      sourceWalletId: string;
      items: Array<{
        walletId: string;
        address: string;
        amount: string | bigint;
      }>;
    };
    if (!body.sourceWalletId) {
      return NextResponse.json(
        { error: "Source wallet is required" },
        { status: 400 }
      );
    }
    const source = getWallet(body.sourceWalletId);
    if (!source)
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    if (!source.enabled)
      return NextResponse.json(
        { error: "Source wallet is disabled" },
        { status: 400 }
      );

    const items: DistributionItem[] = [];
    const errors: string[] = [];
    for (const raw of body.items ?? []) {
      if (!raw.walletId || !raw.address || raw.amount === undefined) continue;
      if (!/^0x[0-9a-fA-F]{40}$/.test(raw.address)) {
        errors.push(`Invalid recipient: ${raw.address}`);
        continue;
      }
      const amt =
        typeof raw.amount === "bigint"
          ? raw.amount
          : BigInt(String(raw.amount));
      if (amt <= 0n) continue;
      items.push({
        walletId: raw.walletId,
        address: raw.address as `0x${string}`,
        amount: amt,
      });
    }

    const settings = await resolveRiskSettings();
    const sourceBal = await getFullWalletBalance(source.address).catch(
      () => null
    );
    const sourceNative = sourceBal?.nativeUSDC ?? 0n;
    const sourceGas = sourceBal?.gasReserve ?? 0n;
    const safeSpendable = sourceBal?.safe?.safeSpendable ?? 0n;

    const perTransferGas = estimateNativeTransferGas(1).reserveWithSafety;
    const count = BigInt(Math.max(items.length, 0));
    const estimatedGas = perTransferGas * count;
    const total = items.reduce((a, b) => a + b.amount, 0n);

    if (items.length === 0) errors.push("No valid recipients");
    if (total + estimatedGas > sourceNative && sourceBal) {
      errors.push("Source balance insufficient for total + gas");
    }
    if (total > safeSpendable && sourceBal) {
      errors.push("Total exceeds safe spendable (gas reserved)");
    }
    if (sourceNative < settings.minGasReserveUSDC) {
      errors.push("Source below minimum gas reserve");
    }

    const remainingAfter =
      sourceNative > total + estimatedGas
        ? sourceNative - total - estimatedGas
        : 0n;

    const preview: DistributionPreview = {
      sourceWalletId: source.id,
      sourceAddress: source.address,
      items,
      total,
      estimatedGas,
      perTransferGas,
      remainingAfter,
      botFee: BOT_FEE,
      valid: errors.length === 0,
      errors,
    };

    const risk = checkDistributionAgainstRisk({ preview, settings });

    return NextResponse.json({
      preview: serializeBigint(preview),
      risk,
      sourceBal: serializeBigint(sourceBal ?? {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
