import type { Hex } from "viem";
import {
  ARC_CONTRACTS,
  ERC20_ABI,
  NATIVE_USDC_DECIMALS,
  UNISWAP_V3_FACTORY_ABI,
  UNISWAP_V3_FEE_TIERS,
  UNISWAP_V3_POOL_ABI,
} from "./contracts";
import { getArcPublicClient } from "./arc";
import type { TokenInfo } from "@/types";

export async function getErc20Metadata(address: Hex): Promise<{
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
}> {
  const client = getArcPublicClient();
  try {
    const [name, symbol, decimals, totalSupply] = (await client.multicall({
      contracts: [
        { address, abi: ERC20_ABI, functionName: "name" },
        { address, abi: ERC20_ABI, functionName: "symbol" },
        { address, abi: ERC20_ABI, functionName: "decimals" },
        { address, abi: ERC20_ABI, functionName: "totalSupply" },
      ],
      allowFailure: false,
    })) as [string, string, number, bigint];
    return { name, symbol, decimals, totalSupply };
  } catch {
    const calls = [
      client.readContract({ address, abi: ERC20_ABI, functionName: "name" }),
      client.readContract({ address, abi: ERC20_ABI, functionName: "symbol" }),
      client.readContract({ address, abi: ERC20_ABI, functionName: "decimals" }),
      client.readContract({ address, abi: ERC20_ABI, functionName: "totalSupply" }),
    ] as const;
    const [name, symbol, decimals, totalSupply] = await Promise.all(calls);
    return {
      name: String(name),
      symbol: String(symbol),
      decimals: Number(decimals),
      totalSupply: BigInt(String(totalSupply ?? 0)),
    };
  }
}

export async function findUsdcPoolForToken(
  tokenAddress: Hex
): Promise<{ pool: Hex; fee: number } | null> {
  const client = getArcPublicClient();
  try {
    const results = await client.multicall({
      contracts: UNISWAP_V3_FEE_TIERS.map((fee) => ({
        address: ARC_CONTRACTS.UNISWAP_V3_FACTORY,
        abi: UNISWAP_V3_FACTORY_ABI,
        functionName: "getPool",
        args: [tokenAddress, ARC_CONTRACTS.USDC, fee],
      })),
      allowFailure: true,
    });

    for (let i = 0; i < results.length; i++) {
      const res = results[i] as {
        status: "success" | "failure";
        result?: unknown;
      };
      if (
        res.status === "success" &&
        typeof res.result === "string" &&
        res.result !== "0x0000000000000000000000000000000000000000"
      ) {
        return { pool: res.result as Hex, fee: UNISWAP_V3_FEE_TIERS[i] };
      }
    }
    return null;
  } catch {
    for (let i = 0; i < UNISWAP_V3_FEE_TIERS.length; i++) {
      try {
        const pool = (await client.readContract({
          address: ARC_CONTRACTS.UNISWAP_V3_FACTORY,
          abi: UNISWAP_V3_FACTORY_ABI,
          functionName: "getPool",
          args: [tokenAddress, ARC_CONTRACTS.USDC, UNISWAP_V3_FEE_TIERS[i]],
        })) as unknown;
        if (
          typeof pool === "string" &&
          pool !== "0x0000000000000000000000000000000000000000"
        ) {
          return { pool: pool as Hex, fee: UNISWAP_V3_FEE_TIERS[i] };
        }
      } catch {
        continue;
      }
    }
    return null;
  }
}

export async function estimatePoolLiquidityUSDC(
  pool: Hex
): Promise<bigint | undefined> {
  try {
    const client = getArcPublicClient();
    const [slot0Res, usdcBalRaw] = (await client.multicall({
      contracts: [
        { address: pool, abi: UNISWAP_V3_POOL_ABI, functionName: "slot0" },
        {
          address: ARC_CONTRACTS.USDC,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [pool],
        },
      ],
      allowFailure: true,
    })) as unknown as Array<{
      status: "success" | "failure";
      result?: unknown;
    }>;
    if (usdcBalRaw.status === "success") {
      return usdcBalRaw.result as bigint;
    }
    if (slot0Res.status === "success") {
      return 0n;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function validateToken(address: Hex): Promise<TokenInfo> {
  const errors: string[] = [];
  let metadata: {
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: bigint;
  } | null = null;
  try {
    metadata = await getErc20Metadata(address);
  } catch (err) {
    return {
      address,
      symbol: "???",
      name: "Unknown",
      decimals: 18,
      totalSupply: 0n,
      hasRoute: false,
      verified: false,
      error:
        err instanceof Error
          ? err.message
          : "Unable to read token metadata. Not an ERC-20 or RPC unavailable.",
    };
  }

  if (metadata.decimals < 0 || metadata.decimals > 36) {
    errors.push("Invalid decimals");
  }

  const poolInfo = await findUsdcPoolForToken(address);
  let liquidityUSDC: bigint | undefined;
  if (poolInfo) {
    liquidityUSDC = await estimatePoolLiquidityUSDC(poolInfo.pool);
  }

  const hasRoute = !!poolInfo;
  if (!hasRoute) errors.push("No USDC swap route");

  return {
    address,
    symbol: metadata.symbol,
    name: metadata.name,
    decimals: metadata.decimals,
    totalSupply: metadata.totalSupply,
    liquidityUSDC,
    hasRoute,
    verified: errors.length === 0,
    error: errors[0],
  };
}

export { NATIVE_USDC_DECIMALS };
