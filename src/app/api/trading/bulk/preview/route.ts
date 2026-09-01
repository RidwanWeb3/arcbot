import { NextResponse } from "next/server";
import {
  getFullWalletBalance,
  getErc20Balance,
} from "@/lib/blockchain/balances";
import { getTradeQuote } from "@/lib/blockchain/quotes";
import { validateToken } from "@/lib/blockchain/token";
import { getWallet, listWallets } from "@/lib/wallet/manager";
import {
  checkTradeAgainstRisk,
  resolveRiskSettings,
} from "@/lib/validation/risk";
import { writeAudit } from "@/lib/validation/audit";
import type { Hex } from "viem";
import type {
  BulkTradeItem,
  BulkTradePreview,
  Wallet,
} from "@/types";

export const dynamic = "force-dynamic";

function serialize(obj: unknown): unknown {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      direction: "BUY" | "SELL";
      tokenAddress: string;
      slippageBps: number;
      walletIds?: string[];
      amounts?: Record<string, string>;
      sellAll?: boolean;
    };

    if (!body.direction || !body.tokenAddress) {
      return NextResponse.json(
        { error: "direction and tokenAddress required" },
        { status: 400 }
      );
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(body.tokenAddress)) {
      return NextResponse.json(
        { error: "Invalid token address" },
        { status: 400 }
      );
    }
    if (
      typeof body.slippageBps !== "number" ||
      body.slippageBps < 0 ||
      body.slippageBps > 10000
    ) {
      return NextResponse.json({ error: "Invalid slippage" }, { status: 400 });
    }

    const token = await validateToken(body.tokenAddress as Hex);
    const settings = await resolveRiskSettings();

    const allWallets = listWallets().filter((w) => w.enabled);
    const wallets: Wallet[] = body.walletIds?.length
      ? allWallets.filter((w) => body.walletIds!.includes(w.id))
      : allWallets;

    if (wallets.length === 0) {
      return NextResponse.json(
        { error: "No enabled wallets selected" },
        { status: 400 }
      );
    }

    const items: BulkTradeItem[] = [];
    const globalErrors: string[] = [];

    for (const w of wallets) {
      try {
        const bal = await getFullWalletBalance(w.address).catch(() => null);
        const safeSpendable = bal?.safe?.safeSpendable ?? 0n;

        let amount: bigint = 0n;
        let tokenBalance = 0n;

        if (body.direction === "BUY") {
          const raw = (body.amounts?.[w.id] ?? "0").trim();
          const { parseUSDC } = await import("@/lib/blockchain/gas");
          amount =
            raw.length > 0 && !isNaN(Number(raw)) ? parseUSDC(raw) : 0n;
        } else {
          try {
            tokenBalance = await getErc20Balance(
              w.address,
              token.address
            );
          } catch {
            tokenBalance = 0n;
          }
          if (body.sellAll) {
            amount = tokenBalance;
          } else {
            const raw = (body.amounts?.[w.id] ?? "0").trim();
            const { formatUnits, parseUnits } = await import("viem");
            amount =
              raw.length > 0 && !isNaN(Number(raw))
                ? parseUnits(raw, token.decimals)
                : 0n;
          }
        }

        const item: BulkTradeItem = {
          walletId: w.id,
          amount,
          tokenBalance,
        };

        if (amount <= 0n) {
          item.error = "Zero amount";
          items.push(item);
          continue;
        }

        if (body.direction === "BUY" && amount > safeSpendable) {
          item.error = "Exceeds safeSpendable balance";
          items.push(item);
          continue;
        }
        if (body.direction === "SELL" && amount > tokenBalance) {
          item.error = "Exceeds token balance";
          items.push(item);
          continue;
        }

        try {
          const quote = await getTradeQuote({
            direction: body.direction,
            amount,
            token,
            slippageBps: body.slippageBps,
          });
          item.quote = quote;

          const risk = checkTradeAgainstRisk({
            quote,
            token,
            walletSafeSpendable: safeSpendable,
            walletTokenBalance: tokenBalance,
            settings,
          });
          item.risk = risk;
          if (!risk.ok) {
            item.error = "RISK: " + risk.errors.join("; ");
          }
        } catch (e) {
          item.error = e instanceof Error ? e.message : "Quote failed";
        }

        items.push(item);
      } catch (e) {
        items.push({
          walletId: w.id,
          amount: 0n,
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    const validItems = items.filter(
      (i) => !i.error && i.amount > 0n && i.quote
    );

    let totalInput = 0n;
    let totalExpectedOutput = 0n;
    let totalEstimatedGas = 0n;
    let totalDexFee = 0n;

    for (const i of validItems) {
      if (!i.quote) continue;
      totalInput += i.quote.inputAmount;
      totalExpectedOutput += i.quote.expectedOutput;
      totalEstimatedGas += i.quote.estimatedGas;
      totalDexFee += i.quote.dexFee;
    }

    const preview: BulkTradePreview = {
      direction: body.direction,
      tokenAddress: token.address,
      tokenSymbol: token.symbol,
      tokenDecimals: token.decimals,
      slippageBps: body.slippageBps,
      items,
      totalInput,
      totalInputSymbol: body.direction === "BUY" ? "USDC" : token.symbol,
      totalExpectedOutput,
      totalExpectedOutputSymbol:
        body.direction === "BUY" ? token.symbol : "USDC",
      totalEstimatedGas,
      totalDexFee,
      validItems: validItems.length,
      totalItems: items.length,
      errors: globalErrors,
    };

    await writeAudit({
      action: `TRADE.BULK.PREVIEW.${body.direction}`,
      walletId: "BATCH",
      walletLabel: `${validItems.length}/${items.length} wallets`,
      amount: totalInput,
      status: preview.validItems > 0 ? "READY" : "BLOCKED",
      meta: {
        token: token.address,
        symbol: token.symbol,
        direction: body.direction,
        validItems: preview.validItems,
        totalItems: preview.totalItems,
        errors: items
          .filter((i) => i.error)
          .map((i) => ({ walletId: i.walletId, error: i.error })),
      },
    });

    return NextResponse.json({
      preview: serialize(preview),
      token: serialize(token),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bulk preview failed" },
      { status: 500 }
    );
  }
}
