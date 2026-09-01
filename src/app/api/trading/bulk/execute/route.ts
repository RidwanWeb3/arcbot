import { NextResponse } from "next/server";
import {
  getWallet,
  getWalletPrivateKey,
  acquireWalletNonceLock,
  releaseWalletNonceLock,
  touchWalletActivity,
} from "@/lib/wallet/manager";
import { createSigningContext, executeV3Swap } from "@/lib/blockchain/swaps";
import { getTradeQuote } from "@/lib/blockchain/quotes";
import { validateToken } from "@/lib/blockchain/token";
import { getFullWalletBalance, getErc20Balance } from "@/lib/blockchain/balances";
import {
  checkTradeAgainstRisk,
  resolveRiskSettings,
} from "@/lib/validation/risk";
import { writeAudit } from "@/lib/validation/audit";
import { saveTransaction } from "@/lib/database/client";
import type { Hex } from "viem";
import type { BulkTradeResult, TransactionRecord } from "@/types";
import { generateId } from "@/lib/utils";
import { BOT_FEE } from "@/lib/blockchain/contracts";

export const dynamic = "force-dynamic";

async function runSingleTrade(params: {
  direction: "BUY" | "SELL";
  walletId: string;
  tokenAddress: string;
  amount: bigint;
  slippageBps: number;
}): Promise<BulkTradeResult> {
  const w = getWallet(params.walletId);
  if (!w) {
    return {
      walletId: params.walletId,
      amount: params.amount.toString(),
      success: false,
      error: "Wallet not found",
    };
  }
  if (!w.enabled) {
    return {
      walletId: params.walletId,
      amount: params.amount.toString(),
      success: false,
      error: "Wallet disabled",
    };
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(params.tokenAddress)) {
    return {
      walletId: params.walletId,
      amount: params.amount.toString(),
      success: false,
      error: "Invalid token",
    };
  }
  if (params.amount <= 0n) {
    return {
      walletId: params.walletId,
      amount: params.amount.toString(),
      success: false,
      error: "Amount required",
    };
  }

  const token = await validateToken(params.tokenAddress as Hex);
  const quote = await getTradeQuote({
    direction: params.direction,
    amount: params.amount,
    token,
    slippageBps: params.slippageBps,
  });
  const settings = await resolveRiskSettings();
  const bal = await getFullWalletBalance(w.address).catch(() => null);
  const tokenBalance =
    params.direction === "SELL"
      ? await getErc20Balance(w.address, token.address).catch(() => 0n)
      : 0n;
  const risk = checkTradeAgainstRisk({
    quote,
    token,
    walletSafeSpendable: bal?.safe?.safeSpendable ?? 0n,
    walletTokenBalance: tokenBalance,
    settings,
  });
  if (!risk.ok) {
    return {
      walletId: params.walletId,
      amount: params.amount.toString(),
      success: false,
      error: "RISK BLOCKED: " + risk.errors.join("; "),
    };
  }

  const locked = acquireWalletNonceLock(w.id);
  if (!locked) {
    return {
      walletId: params.walletId,
      amount: params.amount.toString(),
      success: false,
      error: "Wallet locked. Another operation is in progress.",
    };
  }
  let pk: `0x${string}`;
  try {
    pk = getWalletPrivateKey(w.id);
  } catch (e) {
    releaseWalletNonceLock(w.id);
    return {
      walletId: params.walletId,
      amount: params.amount.toString(),
      success: false,
      error: e instanceof Error ? e.message : "Key error",
    };
  }

  const created: TransactionRecord = {
    id: generateId("tx_"),
    walletId: w.id,
    walletLabel: w.label,
    action: params.direction,
    amountIn: params.amount,
    tokenAddress: token.address,
    tokenSymbol: token.symbol,
    status: "SUBMITTING",
    createdAt: Date.now(),
  };
  await saveTransaction(created);

  try {
    const ctx = createSigningContext(pk);
    const result = await executeV3Swap({
      ctx,
      direction: params.direction,
      token,
      amount: params.amount,
      minimumOutput: quote.minimumOutput,
      recipient: w.address as `0x${string}`,
    });

    touchWalletActivity(w.id);

    const actualOut = result.amountOut ?? quote.minimumOutput;
    const updated: TransactionRecord = {
      ...created,
      status: result.success ? "CONFIRMED" : "FAILED",
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      gasUsed: result.gasUsed,
      amountOut: result.success ? actualOut : undefined,
      error: result.error,
      submittedAt: Date.now(),
      confirmedAt: result.success ? Date.now() : undefined,
    };
    await saveTransaction(updated);
    await writeAudit({
      action: `TRADE.BULK.EXECUTE.${params.direction}`,
      walletId: w.id,
      walletLabel: w.label,
      amount: params.amount,
      txHash: result.txHash,
      status: updated.status,
      meta: {
        token: token.address,
        symbol: token.symbol,
        expectedOut: quote.expectedOutput.toString(),
        amountOut: actualOut.toString(),
        error: result.error,
      },
    });

    return {
      walletId: params.walletId,
      amount: params.amount.toString(),
      success: result.success,
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      gasUsed: result.gasUsed?.toString(),
      amountOut: result.success ? actualOut.toString() : undefined,
      error: result.error,
    };
  } catch (err) {
    await saveTransaction({
      ...created,
      status: "FAILED",
      error: err instanceof Error ? err.message : "Unknown",
    });
    return {
      walletId: params.walletId,
      amount: params.amount.toString(),
      success: false,
      error: err instanceof Error ? err.message : "Execute failed",
    };
  } finally {
    releaseWalletNonceLock(w.id);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      direction: "BUY" | "SELL";
      tokenAddress: string;
      slippageBps: number;
      items: Array<{ walletId: string; amount: string | bigint }>;
      confirm?: boolean;
    };

    if (!body.confirm) {
      return NextResponse.json(
        { error: "Explicit confirmation required" },
        { status: 400 }
      );
    }
    if (!body.direction || !body.tokenAddress) {
      return NextResponse.json(
        { error: "direction, tokenAddress required" },
        { status: 400 }
      );
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "items array required" },
        { status: 400 }
      );
    }

    const slippageBps = Number(body.slippageBps ?? 100);
    const results: BulkTradeResult[] = [];

    for (const it of body.items) {
      const amount =
        typeof it.amount === "bigint"
          ? it.amount
          : BigInt(String(it.amount ?? "0"));
      try {
        const r = await runSingleTrade({
          direction: body.direction,
          walletId: it.walletId,
          tokenAddress: body.tokenAddress,
          amount,
          slippageBps,
        });
        results.push(r);
      } catch (e) {
        results.push({
          walletId: it.walletId,
          amount:
            typeof it.amount === "bigint"
              ? it.amount.toString()
              : String(it.amount ?? "0"),
          success: false,
          error: e instanceof Error ? e.message : "Unexpected error",
        });
      }
    }

    const ok = results.filter((r) => r.success).length;
    const total = results.length;

    await writeAudit({
      action: `TRADE.BULK.SUMMARY.${body.direction}`,
      walletId: "BATCH",
      walletLabel: `${ok}/${total} succeeded`,
      amount: 0n,
      status: ok > 0 ? "CONFIRMED" : "FAILED",
      meta: {
        token: body.tokenAddress,
        direction: body.direction,
        successCount: ok,
        totalCount: total,
        failed: results
          .filter((r) => !r.success)
          .map((r) => ({ walletId: r.walletId, error: r.error })),
      },
    });

    return NextResponse.json({
      results,
      successCount: ok,
      totalCount: total,
      botFee: BOT_FEE.toString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bulk execute failed" },
      { status: 500 }
    );
  }
}
