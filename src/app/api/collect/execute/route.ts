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
import { writeAudit } from "@/lib/validation/audit";
import { saveTransaction } from "@/lib/database/client";
import { BOT_FEE } from "@/lib/blockchain/contracts";
import type {
  DistributionItem,
  TransactionRecord,
  Wallet,
} from "@/types";
import { generateId } from "@/lib/utils";
import { listWallets } from "@/lib/wallet/manager";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      treasuryWalletId: string;
      walletIds: string[];
    };
    const treasury = getWallet(body.treasuryWalletId ?? "");
    if (!treasury)
      return NextResponse.json({ error: "Treasury not found" }, { status: 404 });
    const ids = (body.walletIds ?? []).filter(
      (id) => typeof id === "string" && id.length > 0
    );
    const wallets: Wallet[] = listWallets().filter(
      (w) => ids.includes(w.id) && w.enabled && w.id !== treasury.id
    );
    if (wallets.length === 0)
      return NextResponse.json(
        { error: "No valid wallets selected" },
        { status: 400 }
      );

    const perTransferGas = estimateNativeTransferGas(1).reserveWithSafety;
    const allItems: DistributionItem[] = [];
    const perWalletItems: Record<string, DistributionItem[]> = {};
    for (const w of wallets) {
      try {
        const full = await getFullWalletBalance(w.address);
        const rec = toWalletBalanceRecord(w.id, full);
        const collectable =
          rec.safeCollectable > perTransferGas
            ? rec.safeCollectable - perTransferGas
            : 0n;
        if (collectable > 0n) {
          const item: DistributionItem = {
            walletId: w.id,
            address: treasury.address,
            amount: collectable,
          };
          allItems.push(item);
          perWalletItems[w.id] = [item];
        }
      } catch {
        // skip unreadable
      }
    }

    const results: Array<{
      walletId: string;
      amount: string;
      txHash?: string;
      error?: string;
      success: boolean;
      blockNumber?: number;
      gasUsed?: string;
    }> = [];

    for (const w of wallets) {
      const items = perWalletItems[w.id] ?? [];
      if (items.length === 0) {
        results.push({
          walletId: w.id,
          amount: "0",
          success: false,
          error: "No safe collectable amount",
        });
        continue;
      }
      const locked = acquireWalletNonceLock(w.id);
      if (!locked) {
        results.push({
          walletId: w.id,
          amount: items[0].amount.toString(),
          success: false,
          error: "Wallet locked",
        });
        continue;
      }
      let pk: `0x${string}`;
      try {
        pk = getWalletPrivateKey(w.id);
      } catch (e) {
        releaseWalletNonceLock(w.id);
        results.push({
          walletId: w.id,
          amount: items[0].amount.toString(),
          success: false,
          error: e instanceof Error ? e.message : "Key error",
        });
        continue;
      }
      try {
        const created: TransactionRecord = {
          id: generateId("tx_"),
          walletId: w.id,
          walletLabel: w.label,
          action: "COLLECT",
          amountIn: items[0].amount,
          destination: treasury.address,
          status: "CREATED",
          createdAt: Date.now(),
        };
        await saveTransaction(created);

        const executed = await executeTransfersSequential({
          privateKey: pk,
          items,
        });
        touchWalletActivity(w.id);

        for (const r of executed) {
          const success = !!r.result.success;
          results.push({
            walletId: r.walletId,
            amount: r.amount.toString(),
            txHash: r.result.txHash,
            error: r.result.error,
            success,
            blockNumber: r.result.blockNumber,
            gasUsed: r.result.gasUsed?.toString(),
          });
          await saveTransaction({
            ...created,
            id: generateId("tx_"),
            status: success ? "CONFIRMED" : "FAILED",
            txHash: r.result.txHash,
            blockNumber: r.result.blockNumber,
            gasUsed: r.result.gasUsed,
            error: r.result.error,
            submittedAt: Date.now(),
            confirmedAt: success ? Date.now() : undefined,
          });
          await writeAudit({
            action: "COLLECT.TRANSFER",
            walletId: w.id,
            walletLabel: w.label,
            amount: r.amount,
            destination: treasury.address,
            txHash: r.result.txHash,
            status: success ? "CONFIRMED" : "FAILED",
            meta: { error: r.result.error },
          });
        }
      } catch (err) {
        results.push({
          walletId: w.id,
          amount: items[0].amount.toString(),
          success: false,
          error: err instanceof Error ? err.message : "Unknown",
        });
      } finally {
        releaseWalletNonceLock(w.id);
      }
    }

    await writeAudit({
      action: "COLLECT.EXECUTE",
      walletId: treasury.id,
      walletLabel: treasury.label,
      status: "COMPLETED",
      meta: { count: wallets.length },
    });

    return NextResponse.json({
      results,
      botFee: BOT_FEE.toString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Collect execute failed" },
      { status: 500 }
    );
  }
}

function generated(): string | undefined {
  return undefined;
}
