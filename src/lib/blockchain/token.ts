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
  const defaults = { name: "???", symbol: "???", decimals: 18, totalSupply: 0n };
  const anySuccessRef = { value: false };
  try {
    const results = (await client.multicall({
      contracts: [
        { address, abi: ERC20_ABI, functionName: "name" },
        { address, abi: ERC20_ABI, functionName: "symbol" },
        { address, abi: ERC20_ABI, functionName: "decimals" },
        { address, abi: ERC20_ABI, functionName: "totalSupply" },
      ],
      allowFailure: true,
    })) as Array<{ status: "success" | "failure"; result?: unknown }>;
    const nameR = results[0];
    const symbolR = results[1];
    const decR = results[2];
    const tsR = results[3];
    const coerceStr = (r: { status: string; result?: unknown }, fallback: string) => {
      if (r.status !== "success" || r.result === undefined || r.result === null) return fallback;
      anySuccessRef.value = true;
      const raw = r.result;
      if (typeof raw === "string") return raw;
      try {
        const s = String(raw);
        return s.replace(/\u0000/g, "").trim() || fallback;
      } catch {
        return fallback;
      }
    };
    const coerceNum = (r: { status: string; result?: unknown }, fallback: number) => {
      if (r.status !== "success" || r.result === undefined || r.result === null) return fallback;
      anySuccessRef.value = true;
      try {
        const n = Number(r.result);
        return Number.isFinite(n) && n >= 0 && n <= 36 ? n : fallback;
      } catch {
        return fallback;
      }
    };
    const coerceBi = (r: { status: string; result?: unknown }, fallback: bigint) => {
      if (r.status !== "success" || r.result === undefined || r.result === null) return fallback;
      anySuccessRef.value = true;
      try {
        return BigInt(String(r.result));
      } catch {
        return fallback;
      }
    };
    const name = coerceStr(nameR, defaults.name);
    const symbol = coerceStr(symbolR, defaults.symbol);
    const decimals = coerceNum(decR, defaults.decimals);
    const totalSupply = coerceBi(tsR, defaults.totalSupply);
    if (!anySuccessRef.value) {
      throw new Error("RPC_UNAVAILABLE");
    }
    return { name, symbol, decimals, totalSupply };
  } catch (e) {
    if (e instanceof Error && e.message === "RPC_UNAVAILABLE") {
      throw new Error(
        "RPC unavailable or eth_call blocked (check provider quota / RPC URL)."
      );
    }
    const safeCall = async <T,>(fn: () => Promise<T>, fallback: T, post?: (v: T) => unknown): Promise<{ value: unknown; ok: boolean }> => {
      try {
        const v = await fn();
        return { value: post ? post(v) : v, ok: true };
      } catch {
        return { value: fallback, ok: false };
      }
    };
    const [nameRes, symRes, decRes, tsRes] = await Promise.all([
      safeCall(() => client.readContract({ address, abi: ERC20_ABI, functionName: "name" }), defaults.name, (v) =>
        typeof v === "string" ? v : defaults.name,
      ),
      safeCall(() => client.readContract({ address, abi: ERC20_ABI, functionName: "symbol" }), defaults.symbol, (v) =>
        typeof v === "string" ? v : defaults.symbol,
      ),
      safeCall(() => client.readContract({ address, abi: ERC20_ABI, functionName: "decimals" }), defaults.decimals, (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 && n <= 36 ? n : defaults.decimals;
      }),
      safeCall(() => client.readContract({ address, abi: ERC20_ABI, functionName: "totalSupply" }), defaults.totalSupply, (v) => {
        try {
          return BigInt(String(v));
        } catch {
          return defaults.totalSupply;
        }
      }),
    ]);
    anySuccessRef.value = nameRes.ok || symRes.ok || decRes.ok || tsRes.ok;
    if (!anySuccessRef.value) {
      throw new Error(
        "RPC unavailable or eth_call blocked (check provider quota / RPC URL)."
      );
    }
    return {
      name: String(nameRes.value ?? defaults.name).replace(/\u0000/g, "").trim() || defaults.name,
      symbol: String(symRes.value ?? defaults.symbol).replace(/\u0000/g, "").trim() || defaults.symbol,
      decimals: Number(decRes.value ?? defaults.decimals),
      totalSupply: BigInt(String(tsRes.value ?? defaults.totalSupply)),
    };
  }
}

export async function findUsdcPoolForToken(
  tokenAddress: Hex
): Promise<{ pool: Hex; fee: number } | null> {
  const client = getArcPublicClient();
  let anySuccessCall = false;
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
      if (res.status === "success") anySuccessCall = true;
      if (
        res.status === "success" &&
        typeof res.result === "string" &&
        res.result !== "0x0000000000000000000000000000000000000000"
      ) {
        return { pool: res.result as Hex, fee: UNISWAP_V3_FEE_TIERS[i] };
      }
    }
    if (!anySuccessCall) {
      throw new Error("RPC_UNAVAILABLE");
    }
    return null;
  } catch (e) {
    if (e instanceof Error && e.message === "RPC_UNAVAILABLE") throw e;
    anySuccessCall = false;
    for (let i = 0; i < UNISWAP_V3_FEE_TIERS.length; i++) {
      try {
        const pool = (await client.readContract({
          address: ARC_CONTRACTS.UNISWAP_V3_FACTORY,
          abi: UNISWAP_V3_FACTORY_ABI,
          functionName: "getPool",
          args: [tokenAddress, ARC_CONTRACTS.USDC, UNISWAP_V3_FEE_TIERS[i]],
        })) as unknown;
        anySuccessCall = true;
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
    if (!anySuccessCall) {
      throw new Error("RPC unavailable: cannot reach Uniswap V3 Factory");
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
