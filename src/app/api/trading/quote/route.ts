import { NextResponse } from "next/server";
import { getFullWalletBalance } from "@/lib/blockchain/balances";
import { getTradeQuote } from "@/lib/blockchain/quotes";
import { validateToken } from "@/lib/blockchain/token";
import { getWallet } from "@/lib/wallet/manager";
import {
  checkTradeAgainstRisk,
  resolveRiskSettings,
} from "@/lib/validation/risk";
import { estimateSwapGas } from "@/lib/blockchain/gas";
import { writeAudit } from "@/lib/validation/audit";
import type { Hex } from "viem";

export const dynamic = "force-dynamic";

function serialize(obj: unknown): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      walletId: string;
      tokenAddress: string;
      direction: "BUY" | "SELL";
      amount?: string | bigint;
      amountUSDC?: string | number | bigint;
      slippageBps: number;
    };
    if (!body.walletId || !body.tokenAddress || !body.direction) {
      return NextResponse.json(
        { error: "walletId, tokenAddress, direction required" },
        { status: 400 }
      );
    }
    const w = getWallet(body.walletId);
    if (!w) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    if (!w.enabled)
      return NextResponse.json({ error: "Wallet disabled" }, { status: 400 });
    if (!/^0x[0-9a-fA-F]{40}$/.test(body.tokenAddress)) {
      return NextResponse.json(
        { error: "Invalid token address" },
        { status: 400 }
      );
    }
    if (typeof body.slippageBps !== "number" || body.slippageBps < 0) {
      return NextResponse.json({ error: "Invalid slippage" }, { status: 400 });
    }
    const rawAmount =
      body.amount !== undefined && body.amount !== null
        ? body.amount
        : body.direction === "BUY" && body.amountUSDC !== undefined
          ? String(body.amountUSDC)
          : "0";
    const amount =
      typeof rawAmount === "bigint"
        ? rawAmount
        : BigInt(String(rawAmount ?? "0"));
    if (amount <= 0n)
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });

    const token = await validateToken(body.tokenAddress as Hex);
    const quote = await getTradeQuote({
      direction: body.direction,
      amount,
      token,
      slippageBps: body.slippageBps,
    });
    const settings = await resolveRiskSettings();
    const bal = await getFullWalletBalance(w.address).catch(() => null);

    let tokenBalance = 0n;
    if (body.direction === "SELL") {
      try {
        const { getErc20Balance } = await import("@/lib/blockchain/balances");
        tokenBalance = await getErc20Balance(w.address, token.address);
      } catch {
        tokenBalance = 0n;
      }
    }

    const risk = checkTradeAgainstRisk({
      quote,
      token,
      walletSafeSpendable: bal?.safe?.safeSpendable ?? 0n,
      walletTokenBalance: tokenBalance,
      settings,
    });

    await writeAudit({
      action: `TRADE.QUOTE.${body.direction}`,
      walletId: w.id,
      walletLabel: w.label,
      amount,
      status: risk.ok ? "READY" : "BLOCKED",
      meta: {
        token: token.address,
        symbol: token.symbol,
        errors: risk.errors,
      },
    });

    return NextResponse.json({
      quote: serialize(quote),
      token: serialize(token),
      walletBal: serialize(bal),
      tokenBalance: tokenBalance.toString(),
      risk,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Quote failed" },
      { status: 500 }
    );
  }
}
