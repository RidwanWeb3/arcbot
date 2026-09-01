import {
  DEFAULT_RISK_SETTINGS,
  type CollectPreview,
  type DistributionPreview,
  type RiskSettings,
  type TokenInfo,
  type TradeQuote,
} from "@/types";
import { getRiskSettings } from "@/lib/database/client";

export interface RiskCheckResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export async function resolveRiskSettings(): Promise<RiskSettings> {
  return getRiskSettings(DEFAULT_RISK_SETTINGS);
}

export function checkTradeAgainstRisk(params: {
  quote: TradeQuote;
  token: TokenInfo;
  walletSafeSpendable: bigint;
  walletTokenBalance: bigint;
  settings: RiskSettings;
}): RiskCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { quote, token, walletSafeSpendable, walletTokenBalance, settings } =
    params;

  if (quote.direction === "BUY") {
    const totalOutlay = quote.inputAmount + quote.estimatedGas + quote.dexFee;
    if (totalOutlay > walletSafeSpendable) {
      errors.push("Insufficient safe spendable balance");
    }
    if (quote.inputAmount > settings.maxTradeAmountUSDC) {
      errors.push("Maximum trade amount exceeded");
    }
  } else {
    if (quote.inputAmount > walletTokenBalance) {
      errors.push("Insufficient token balance");
    }
  }

  if (quote.error) errors.push(quote.error);
  if (quote.priceImpactBps > settings.maxPriceImpactBps) {
    errors.push("Maximum price impact exceeded");
  }
  if (quote.slippageBps > settings.maxSlippageBps) {
    errors.push("Slippage tolerance exceeds maximum allowed");
  }
  if (
    token.liquidityUSDC !== undefined &&
    token.liquidityUSDC < settings.minLiquidityUSDC
  ) {
    errors.push("Below minimum liquidity threshold");
  }
  if (
    settings.maxPriceImpactBps > 100 &&
    quote.priceImpactBps > settings.maxPriceImpactBps / 2
  ) {
    warnings.push("High price impact");
  }
  if (!token.hasRoute) errors.push("No swap route");
  if (!token.verified) warnings.push("Token not verified");

  return { ok: errors.length === 0, errors, warnings };
}

export function checkDistributionAgainstRisk(params: {
  preview: DistributionPreview;
  settings: RiskSettings;
}): RiskCheckResult {
  const errors: string[] = [...params.preview.errors];
  const warnings: string[] = [];
  if (params.preview.total > params.settings.maxDailySpendUSDC) {
    errors.push("Distribution exceeds max daily spend");
  }
  if (params.preview.estimatedGas > params.preview.total / 20n) {
    warnings.push("Gas is > 5% of distribution total");
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function checkCollectAgainstRisk(params: {
  preview: CollectPreview;
  settings: RiskSettings;
}): RiskCheckResult {
  const errors: string[] = [...params.preview.errors];
  const warnings: string[] = [];
  if (params.preview.safeCollection === 0n) {
    errors.push("No safe amount to collect");
  }
  return { ok: errors.length === 0, errors, warnings };
}
