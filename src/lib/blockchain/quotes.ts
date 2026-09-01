import type { Hex } from "viem";
import {
  ARC_CONTRACTS,
  ERC20_ABI,
  DEX_FEE_BPS_MAP,
  UNISWAP_V3_FACTORY_ABI,
  UNISWAP_V3_FEE_TIERS,
  UNISWAP_V3_POOL_ABI,
  type UniswapFeeTier,
} from "./contracts";
import { getArcPublicClient } from "./arc";
import {
  applySlippageDown,
  estimateSwapGas,
  formatBigInt,
} from "./gas";
import type { TokenInfo, TradeQuote } from "@/types";
import { BOT_FEE } from "./contracts";

export async function resolvePoolAndFee(
  token: Hex
): Promise<{ pool: Hex; fee: UniswapFeeTier } | null> {
  const client = getArcPublicClient();
  try {
    const results = (await client.multicall({
      contracts: UNISWAP_V3_FEE_TIERS.map((fee) => ({
        address: ARC_CONTRACTS.UNISWAP_V3_FACTORY,
        abi: UNISWAP_V3_FACTORY_ABI,
        functionName: "getPool",
        args: [token, ARC_CONTRACTS.USDC, fee],
      })),
      allowFailure: true,
    })) as unknown as Array<{
      status: "success" | "failure";
      result?: unknown;
    }>;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (
        r.status === "success" &&
        typeof r.result === "string" &&
        r.result !== "0x0000000000000000000000000000000000000000"
      ) {
        return { pool: r.result as Hex, fee: UNISWAP_V3_FEE_TIERS[i] };
      }
    }
    return null;
  } catch {
    for (const fee of UNISWAP_V3_FEE_TIERS) {
      try {
        const pool = (await client.readContract({
          address: ARC_CONTRACTS.UNISWAP_V3_FACTORY,
          abi: UNISWAP_V3_FACTORY_ABI,
          functionName: "getPool",
          args: [token, ARC_CONTRACTS.USDC, fee],
        })) as unknown;
        if (
          typeof pool === "string" &&
          pool !== "0x0000000000000000000000000000000000000000"
        ) {
          return { pool: pool as Hex, fee };
        }
      } catch {
        continue;
      }
    }
    return null;
  }
}

async function getPoolForToken(
  token: Hex
): Promise<{ pool: Hex; fee: UniswapFeeTier } | null> {
  return resolvePoolAndFee(token);
}

const Q96 = 2n ** 96n;

function computePriceFromSqrtPriceX96(
  sqrtPriceX96: bigint,
  token0Decimals: number,
  token1Decimals: number,
  token0IsUSDC: boolean
): bigint {
  const priceX192 = sqrtPriceX96 * sqrtPriceX96;
  const priceRatio = priceX192 / Q96 / Q96;
  const scale = token0IsUSDC
    ? 10n ** BigInt(18 + token1Decimals - token0Decimals)
    : 10n ** BigInt(18 + token0Decimals - token1Decimals);
  if (token0IsUSDC) {
    if (priceRatio === 0n) return 0n;
    return (scale * 10n ** 18n) / priceRatio / 10n ** 18n;
  }
  return (priceRatio * scale) / 10n ** 18n;
}

async function quoteV3SingleHop(params: {
  direction: "BUY" | "SELL";
  amount: bigint;
  tokenAddress: Hex;
  tokenDecimals: number;
  tokenSymbol: string;
  slippageBps: number;
}): Promise<TradeQuote> {
  const { direction, amount, tokenAddress, tokenDecimals, tokenSymbol, slippageBps } =
    params;
  const client = getArcPublicClient();
  const pool = await getPoolForToken(tokenAddress);
  if (!pool) {
    return {
      tokenAddress,
      tokenSymbol,
      tokenDecimals,
      direction,
      inputAmount: amount,
      inputSymbol: direction === "BUY" ? "USDC" : tokenSymbol,
      expectedOutput: 0n,
      expectedOutputSymbol: direction === "BUY" ? tokenSymbol : "USDC",
      minimumOutput: 0n,
      priceImpactBps: 0,
      estimatedGas: estimateSwapGas().reserveWithSafety,
      dexFee: 0n,
      botFee: BOT_FEE,
      route: "USDC <-> TOKEN (V3)",
      slippageBps,
      error: "No USDC pool available for this token",
    };
  }

  const [t0Res, t1Res, slot0Res] = await client.multicall({
    contracts: [
      { address: pool.pool, abi: UNISWAP_V3_POOL_ABI, functionName: "token0" },
      { address: pool.pool, abi: UNISWAP_V3_POOL_ABI, functionName: "token1" },
      { address: pool.pool, abi: UNISWAP_V3_POOL_ABI, functionName: "slot0" },
    ],
    allowFailure: false,
  });
  const token0 = t0Res as Hex;
  const usdcIsToken0 =
    token0.toLowerCase() === ARC_CONTRACTS.USDC.toLowerCase();
  const [balUsdcRes, balTokenRes] = await client.multicall({
    contracts: [
      {
        address: ARC_CONTRACTS.USDC,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [pool.pool],
      },
      {
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [pool.pool],
      },
    ],
    allowFailure: true,
  });

  const sqrtPriceX96 = (slot0Res as readonly [bigint, number, number, number, number, number, boolean])[0];
  const unitPerToken =
    direction === "BUY"
      ? computePriceFromSqrtPriceX96(
          sqrtPriceX96,
          usdcIsToken0 ? 6 : tokenDecimals,
          usdcIsToken0 ? tokenDecimals : 6,
          usdcIsToken0
        )
      : computePriceFromSqrtPriceX96(
          sqrtPriceX96,
          usdcIsToken0 ? 6 : tokenDecimals,
          usdcIsToken0 ? tokenDecimals : 6,
          !usdcIsToken0
        );

  const balUSDC =
    balUsdcRes.status === "success" ? (balUsdcRes.result as bigint) : 0n;
  const balTOKEN =
    balTokenRes.status === "success" ? (balTokenRes.result as bigint) : 0n;

  let expected: bigint;
  let dex: bigint;
  if (unitPerToken > 0n) {
    if (direction === "BUY") {
      expected = (amount * 10n ** BigInt(tokenDecimals)) / unitPerToken;
      dex = (amount * BigInt(DEX_FEE_BPS_MAP[pool.fee])) / 10000n;
    } else {
      expected = (amount * unitPerToken) / 10n ** BigInt(tokenDecimals);
      dex = (expected * BigInt(DEX_FEE_BPS_MAP[pool.fee])) / 10000n;
      expected = expected > dex ? expected - dex : 0n;
    }
  } else {
    if (direction === "BUY" && balTOKEN > 0n) {
      expected = (amount * balTOKEN) / (balUSDC + 1n);
    } else if (direction === "SELL" && balUSDC > 0n) {
      expected = (amount * balUSDC) / (balTOKEN + 1n);
    } else {
      expected = 0n;
    }
    dex = 0n;
  }

  const minOut = applySlippageDown(expected, slippageBps);
  const reserveForImpact =
    direction === "BUY" ? balUSDC + amount : balTOKEN + amount;
  let impactBps = 0;
  if (reserveForImpact > 0n) {
    impactBps =
      Number(
        ((direction === "BUY" ? amount : expected) * 10000n) / reserveForImpact
      ) || 0;
    impactBps = Math.max(impactBps, 1);
  }

  return {
    tokenAddress,
    tokenSymbol,
    tokenDecimals,
    direction,
    inputAmount: amount,
    inputSymbol: direction === "BUY" ? "USDC" : tokenSymbol,
    expectedOutput: expected,
    expectedOutputSymbol: direction === "BUY" ? tokenSymbol : "USDC",
    minimumOutput: minOut,
    priceImpactBps: impactBps,
    estimatedGas: estimateSwapGas().reserveWithSafety,
    dexFee: dex,
    botFee: BOT_FEE,
    route: `Uniswap V3 ${pool.fee / 100}% pool`,
    slippageBps,
  };
}

export async function getTradeQuote(params: {
  direction: "BUY" | "SELL";
  amount: bigint;
  token: TokenInfo;
  slippageBps: number;
}): Promise<TradeQuote> {
  return quoteV3SingleHop({
    direction: params.direction,
    amount: params.amount,
    tokenAddress: params.token.address,
    tokenDecimals: params.token.decimals,
    tokenSymbol: params.token.symbol,
    slippageBps: params.slippageBps,
  });
}

export function formatQuoteForDisplay(q: TradeQuote) {
  return {
    input: `${formatBigInt(q.inputAmount, q.inputSymbol === "USDC" ? 6 : q.tokenDecimals, 6)} ${q.inputSymbol}`,
    expected: `${formatBigInt(q.expectedOutput, q.expectedOutputSymbol === "USDC" ? 6 : q.tokenDecimals, 6)} ${q.expectedOutputSymbol}`,
    minimum: `${formatBigInt(q.minimumOutput, q.expectedOutputSymbol === "USDC" ? 6 : q.tokenDecimals, 6)} ${q.expectedOutputSymbol}`,
    priceImpact: `${(q.priceImpactBps / 100).toFixed(2)}%`,
  };
}
