import { NextResponse } from "next/server";
import {
  getWallet,
  getWalletPrivateKey,
  acquireWalletNonceLock,
  releaseWalletNonceLock,
  touchWalletActivity,
} from "@/lib/wallet/manager";
import { estimateNativeTransferGas } from "@/lib/blockchain/gas";
import { executeTransfersSequential } from "@/lib/blockchain/transfers";
import { writeAudit } from "@/lib/validation/audit";
import { saveTransaction } from "@/lib/database/client";
import { BOT_FEE } from "@/lib/blockchain/contracts";
import type {
  DistributionItem,
  TransactionRecord,
} from "@/types";
import { generateId } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    sourceWalletId: string;
    items: Array<{
      walletId: string;
      address: string;
      amount: string | bigint;
    }>;
  };
  const source = getWallet(body.sourceWalletId ?? "");
  if (!source)
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  if (!source.enabled)
    return NextResponse.json(
      { error: "Source wallet disabled" },
      { status: 400 }
    );

  const items: DistributionItem[] = (body.items ?? [])
    .filter(
      (r) =>
        r &&
        r.walletId &&
        /^0x[0-9a-fA-F]{40}$/.test(r.address ?? "") &&
        (r.amount !== undefined &&
          (typeof r.amount === "bigint" ? r.amount > 0n : BigInt(String(r.amount)) > 0n))
    )
    .map((r) => ({
      walletId: r.walletId,
      address: r.address as `0x${string}`,
      amount:
        typeof r.amount === "bigint" ? r.amount : BigInt(String(r.amount)),
    }));

  if (items.length === 0) {
    return NextResponse.json(
      { error: "No valid recipients or amounts" },
      { status: 400 }
    );
  }

  const locked = acquireWalletNonceLock(source.id);
  if (!locked) {
    return NextResponse.json(
      { error: "Source wallet is locked. Another operation is in progress." },
      { status: 409 }
    );
  }
  let privateKey: `0x${string}` | null = null;
  try {
    privateKey = getWalletPrivateKey(source.id);
  } catch (err) {
    releaseWalletNonceLock(source.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Key decrypt error" },
      { status: 500 }
    );
  }

  const perTransfer = estimateNativeTransferGas(1).reserveWithSafety;
  const now = Date.now();
  const txs: TransactionRecord[] = items.map((i) => ({
    id: generateId("tx_"),
    walletId: source.id,
    walletLabel: source.label,
    action: "DISTRIBUTION",
    amountIn: i.amount,
    destination: i.address,
    status: "CREATED",
    createdAt: now,
  }));
  for (const tx of txs) await saveTransaction(tx);

  try {
    const results = await executeTransfersSequential({
      privateKey,
      items,
    });
    touchWalletActivity(source.id);

    const out = await Promise.all(
      results.map(async (r, idx) => {
        const tx = txs[idx];
        const updated: TransactionRecord = {
          ...tx,
          status: r.result.success
            ? "CONFIRMED"
            : r.result.error?.toLowerCase().includes("revert")
            ? "REVERTED"
            : "FAILED",
          txHash: r.result.txHash,
          blockNumber: r.result.blockNumber,
          gasUsed: r.result.gasUsed,
          error: r.result.error,
          submittedAt: now,
          confirmedAt: r.result.success ? Date.now() : undefined,
        };
        await saveTransaction(updated);
        await writeAudit({
          action: "DISTRIBUTION.TRANSFER",
          walletId: source.id,
          walletLabel: source.label,
          amount: r.amount,
          destination: r.to,
          txHash: r.result.txHash,
          status: updated.status,
          meta: { error: r.result.error },
        });
        return {
          walletId: r.walletId,
          amount: r.amount.toString(),
          to: r.to,
          txHash: r.result.txHash,
          error: r.result.error,
          success: r.result.success,
          blockNumber: r.result.blockNumber,
          gasUsed: r.result.gasUsed?.toString(),
          txId: tx.id,
        };
      })
    );

    await writeAudit({
      action: "DISTRIBUTION.EXECUTE",
      walletId: source.id,
      walletLabel: source.label,
      amount: items.reduce((a, b) => a + b.amount, 0n),
      status: "CONFIRMED",
      meta: {
        count: items.length,
        estimatedGasPerTransfer: perTransfer.toString(),
      },
    });

    return NextResponse.json({
      results: out,
      botFee: BOT_FEE.toString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Execute failed" },
      { status: 500 }
    );
  } finally {
    releaseWalletNonceLock(source.id);
  }
}
