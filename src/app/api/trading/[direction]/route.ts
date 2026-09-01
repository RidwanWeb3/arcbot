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
import type { TransactionRecord } from "@/types";
import { generateId } from "@/lib/utils";
import { BOT_FEE } from "@/lib/blockchain/contracts";

export const dynamic = "force-dynamic";

async function runTrade(params: {
  direction: "BUY" | "SELL";
  walletId: string;
  tokenAddress: string;
  amount: bigint;
  slippageBps: number;
  confirm: boolean;
}) {
  const w = getWallet(params.walletId);
  if (!w) return { status: 404, body: { error: "Wallet not found" } };
  if (!w.enabled)
    return { status: 400, body: { error: "Wallet disabled" } };
  if (!/^0x[0-9a-fA-F]{40}$/.test(params.tokenAddress)) {
    return { status: 400, body: { error: "Invalid token" } };
  }
  if (!params.confirm) {
    return { status: 400, body: { error: "Explicit confirmation required" } };
  }
  if (params.amount <= 0n) {
    return { status: 400, body: { error: "Amount required" } };
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
      status: 400,
      body: { error: "TRANSACTION BLOCKED: " + risk.errors.join("; ") },
    };
  }

  const locked = acquireWalletNonceLock(w.id);
  if (!locked) {
    return {
      status: 409,
      body: { error: "Wallet locked. Another operation is in progress." },
    };
  }
  let pk: `0x${string}`;
  try {
    pk = getWalletPrivateKey(w.id);
  } catch (e) {
    releaseWalletNonceLock(w.id);
    return {
      status: 500,
      body: { error: e instanceof Error ? e.message : "Key error" },
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

    const updated: TransactionRecord = {
      ...created,
      status: result.success ? "CONFIRMED" : "FAILED",
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      gasUsed: result.gasUsed,
      amountOut: result.success
        ? (result.amountOut ?? quote.minimumOutput)
        : undefined,
      error: result.error,
      submittedAt: Date.now(),
      confirmedAt: result.success ? Date.now() : undefined,
    };
    await saveTransaction(updated);
    await writeAudit({
      action: `TRADE.EXECUTE.${params.direction}`,
      walletId: w.id,
      walletLabel: w.label,
      amount: params.amount,
      txHash: result.txHash,
      status: updated.status,
      meta: {
        token: token.address,
        symbol: token.symbol,
        expectedOut: quote.expectedOutput.toString(),
        error: result.error,
      },
    });

    return {
      status: result.success ? 200 : 502,
      body: {
        tx: JSON.parse(
          JSON.stringify(updated, (_, v) =>
            typeof v === "bigint" ? v.toString() : v
          )
        ),
        quote: JSON.parse(
          JSON.stringify(quote, (_, v) =>
            typeof v === "bigint" ? v.toString() : v
          )
        ),
        token: JSON.parse(
          JSON.stringify(token, (_, v) =>
            typeof v === "bigint" ? v.toString() : v
          )
        ),
        botFee: BOT_FEE.toString(),
        adapterNote: result.success
          ? "Transaction broadcast successfully."
          : "Trade submission failed. Verify ARC DEX swap calldata adapter.",
      },
    };
  } catch (err) {
    await saveTransaction({
      ...created,
      status: "FAILED",
      error: err instanceof Error ? err.message : "Unknown",
    });
    return {
      status: 500,
      body: { error: err instanceof Error ? err.message : "Execute failed" },
    };
  } finally {
    releaseWalletNonceLock(w.id);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      walletId: string;
      tokenAddress: string;
      direction: "BUY" | "SELL";
      amount: string | bigint;
      slippageBps: number;
      confirm?: boolean;
    };
    const amount =
      typeof body.amount === "bigint"
        ? body.amount
        : BigInt(String(body.amount ?? "0"));
    const r = await runTrade({
      direction: body.direction,
      walletId: body.walletId,
      tokenAddress: body.tokenAddress,
      amount,
      slippageBps: Number(body.slippageBps ?? 100),
      confirm: !!body.confirm,
    });
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Execute failed" },
      { status: 500 }
    );
  }
}
