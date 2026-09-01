import type { Hex } from "viem";
import { ARC_CONTRACTS, ERC20_ABI, NATIVE_USDC_DECIMALS } from "./contracts";
import { getArcPublicClient } from "./arc";
import {
  calculateSafeSpendableBalance,
  estimateNativeTransferGas,
  estimateSwapGas,
  type SafeBalanceResult,
} from "./gas";
import type { WalletBalance } from "@/types";

export async function getNativeUSDCBalance(address: Hex): Promise<bigint> {
  const client = getArcPublicClient();
  return client.getBalance({ address });
}

export async function getErc20Balance(
  address: Hex,
  token: Hex
): Promise<bigint> {
  const client = getArcPublicClient();
  const result = await client.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
  });
  return result;
}

export interface WalletBalanceFull {
  nativeUSDC: bigint;
  transferGasReserve: bigint;
  swapGasReserve: bigint;
  gasReserve: bigint;
  safe: SafeBalanceResult;
}

export async function getFullWalletBalance(
  address: Hex
): Promise<WalletBalanceFull> {
  const native = await getNativeUSDCBalance(address);
  const client = getArcPublicClient();
  let gasPrice: bigint;
  try {
    gasPrice = await client.getGasPrice();
  } catch {
    gasPrice = 100_000_000_000n;
  }
  const transferGas = estimateNativeTransferGas(1, gasPrice);
  const swapGas = estimateSwapGas(gasPrice);
  const gasReserve =
    transferGas.reserveWithSafety > swapGas.reserveWithSafety
      ? transferGas.reserveWithSafety
      : swapGas.reserveWithSafety;

  const safe = calculateSafeSpendableBalance({
    nativeBalance: native,
    estimatedGasReserve: gasReserve,
  });

  return {
    nativeUSDC: native,
    transferGasReserve: transferGas.reserveWithSafety,
    swapGasReserve: swapGas.reserveWithSafety,
    gasReserve,
    safe,
  };
}

export function toWalletBalanceRecord(
  walletId: string,
  full: WalletBalanceFull
): WalletBalance {
  return {
    walletId,
    nativeUSDC: full.nativeUSDC,
    gasReserve: full.gasReserve,
    safeSpendable: full.safe.safeSpendable,
    safeCollectable: full.safe.safeCollectable,
    updatedAt: Date.now(),
  };
}

export async function batchGetNativeBalances(
  addresses: Hex[]
): Promise<Map<Hex, bigint>> {
  const client = getArcPublicClient();
  const results = await Promise.all(
    addresses.map((a) =>
      client
        .getBalance({ address: a })
        .then((v) => ({ a, v }))
        .catch(() => ({ a, v: 0n as bigint }))
    )
  );
  const map = new Map<Hex, bigint>();
  for (const r of results) map.set(r.a, r.v);
  return map;
}

export { NATIVE_USDC_DECIMALS, ARC_CONTRACTS };
