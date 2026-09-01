import { parseUnits, formatUnits } from "viem";
import { NATIVE_USDC_DECIMALS } from "./contracts";

export const DEFAULT_ESTIMATED_TRANSFER_GAS = 21000n;
export const DEFAULT_ESTIMATED_ERC20_TRANSFER_GAS = 60000n;
export const DEFAULT_ESTIMATED_SWAP_GAS = 180000n;
export const DEFAULT_GAS_PRICE_WEI = 100_000_000_000n;
export const GAS_SAFETY_MULTIPLIER_BPS = 15000n;

export interface GasEstimate {
  gasUnits: bigint;
  gasPrice: bigint;
  rawReserve: bigint;
  reserveWithSafety: bigint;
}

export function estimateNativeTransferGas(
  count = 1,
  gasPrice?: bigint
): GasEstimate {
  const units = DEFAULT_ESTIMATED_TRANSFER_GAS * BigInt(count);
  const price = gasPrice ?? DEFAULT_GAS_PRICE_WEI;
  const raw = units * price;
  const withSafety =
    (raw * GAS_SAFETY_MULTIPLIER_BPS) / 10000n;
  return {
    gasUnits: units,
    gasPrice: price,
    rawReserve: raw,
    reserveWithSafety: withSafety,
  };
}

export function estimateSwapGas(gasPrice?: bigint): GasEstimate {
  const units = DEFAULT_ESTIMATED_SWAP_GAS;
  const price = gasPrice ?? DEFAULT_GAS_PRICE_WEI;
  const raw = units * price;
  const withSafety = (raw * GAS_SAFETY_MULTIPLIER_BPS) / 10000n;
  return {
    gasUnits: units,
    gasPrice: price,
    rawReserve: raw,
    reserveWithSafety: withSafety,
  };
}

export interface SafeBalanceResult {
  nativeBalance: bigint;
  estimatedGasReserve: bigint;
  safetyMultiplierBps: number;
  safeSpendable: bigint;
  safeCollectable: bigint;
  gasPrice: bigint;
}

export function calculateSafeSpendableBalance(params: {
  nativeBalance: bigint;
  estimatedGasReserve: bigint;
  safetyMultiplierBps?: number;
}): SafeBalanceResult {
  const { nativeBalance, estimatedGasReserve } = params;
  const multiplier = BigInt(params.safetyMultiplierBps ?? 15000);
  const effectiveGas = (estimatedGasReserve * multiplier) / 10000n;

  if (nativeBalance <= effectiveGas) {
    return {
      nativeBalance,
      estimatedGasReserve: effectiveGas,
      safetyMultiplierBps: Number(multiplier),
      safeSpendable: 0n,
      safeCollectable: 0n,
      gasPrice: 0n,
    };
  }

  const safeSpendable = nativeBalance - effectiveGas;
  const safeCollectable = safeSpendable;
  return {
    nativeBalance,
    estimatedGasReserve: effectiveGas,
    safetyMultiplierBps: Number(multiplier),
    safeSpendable,
    safeCollectable,
    gasPrice: 0n,
  };
}

export function gasUnitsToNativeUSDC(
  gasUnits: bigint,
  gasPrice: bigint
): bigint {
  const weiCost = gasUnits * gasPrice;
  return weiToNativeUSDC(weiCost);
}

export function weiToNativeUSDC(wei: bigint): bigint {
  return wei;
}

export function formatUSDC(
  amount: bigint | string | number | null | undefined,
  digits = 2
): string {
  let value = 0n;
  if (typeof amount === "bigint") {
    value = amount;
  } else if (typeof amount === "number") {
    value = BigInt(Math.round(amount * 10 ** NATIVE_USDC_DECIMALS));
  } else if (typeof amount === "string" && amount.length > 0) {
    try {
      value = BigInt(amount);
    } catch {
      value = 0n;
    }
  }
  const fixed = formatUnits(value, NATIVE_USDC_DECIMALS);
  const [int, dec = ""] = fixed.split(".");
  const paddedDec = (dec + "000000").slice(0, Math.max(digits, 0));
  const trimmedDec = paddedDec.replace(/0+$/, "");
  const finalDec = trimmedDec.length === 0 ? "" : `.${trimmedDec}`;
  return `${int}${finalDec}`;
}

export function parseUSDC(input: string): bigint {
  return parseUnits(input, NATIVE_USDC_DECIMALS);
}

export function formatBigInt(
  amount: bigint | string | number | null | undefined,
  decimals: number,
  digits = 4
): string {
  let value = 0n;
  if (typeof amount === "bigint") {
    value = amount;
  } else if (typeof amount === "number") {
    value = BigInt(Math.round(amount * 10 ** decimals));
  } else if (typeof amount === "string" && amount.length > 0) {
    try {
      value = BigInt(amount);
    } catch {
      value = 0n;
    }
  }
  const fixed = formatUnits(value, decimals);
  const [int, dec = ""] = fixed.split(".");
  const paddedDec = (dec + "0".repeat(decimals)).slice(
    0,
    Math.max(digits, 0)
  );
  const trimmedDec = paddedDec.replace(/0+$/, "");
  const finalDec = trimmedDec.length === 0 ? "" : `.${trimmedDec}`;
  return `${int}${finalDec}`;
}

export function applySlippageDown(
  amount: bigint,
  slippageBps: number
): bigint {
  const bps = BigInt(Math.max(0, slippageBps));
  return (amount * (10000n - bps)) / 10000n;
}

export function applySlippageUp(
  amount: bigint,
  slippageBps: number
): bigint {
  const bps = BigInt(Math.max(0, slippageBps));
  return (amount * (10000n + bps) + 9999n) / 10000n;
}
