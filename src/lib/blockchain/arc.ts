import {
  createPublicClient,
  http,
  defineChain,
  type PublicClient,
  type Chain,
  type HttpTransport,
} from "viem";
import { getEnv } from "@/lib/env";
import { ARC_CONTRACTS } from "./contracts";

let cachedClient: PublicClient<HttpTransport, Chain> | null = null;

export const ARC_CHAIN_ID = 5042;

function readEnv(key: string): string | undefined {
  if (typeof process !== "undefined" && process.env) {
    return process.env[key];
  }
  return undefined;
}

export function getArcRpcUrl(): string {
  const env = getEnv();
  const url = env.ARC_RPC_URL;
  if (!url) {
    throw new Error(
      "ARC_RPC_URL is not configured. Set it in the environment variables."
    );
  }
  return url;
}

export function getArcExplorerUrl(): string {
  return readEnv("ARC_EXPLORER_URL") ?? "https://arc-scan.org/";
}

const RPC_URL_PLACEHOLDER = readEnv("ARC_RPC_URL") ?? "";
const EXPLORER_URL_PLACEHOLDER =
  readEnv("ARC_EXPLORER_URL") ?? "https://arc-scan.org/";

export const arcMainnet: Chain = defineChain({
  id: ARC_CHAIN_ID,
  name: "ARC Mainnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 6,
  },
  rpcUrls: {
    default: {
      http: [RPC_URL_PLACEHOLDER],
    },
    public: {
      http: [RPC_URL_PLACEHOLDER],
    },
  },
  blockExplorers: {
    default: {
      name: "ARC Scan",
      url: EXPLORER_URL_PLACEHOLDER,
    },
  },
  contracts: {
    multicall3: {
      address: ARC_CONTRACTS.MULTICALL3,
      blockCreated: 1,
    },
  },
});

export function getArcPublicClient(): PublicClient<HttpTransport, Chain> {
  if (cachedClient) return cachedClient;
  const rpc = getArcRpcUrl();
  cachedClient = createPublicClient({
    chain: {
      ...arcMainnet,
      rpcUrls: {
        default: { http: [rpc] },
        public: { http: [rpc] },
      },
    },
    transport: http(rpc, {
      timeout: 30_000,
      retryCount: 3,
      retryDelay: 250,
    }),
  });
  return cachedClient;
}

export function getExplorerTxUrl(hash: `0x${string}`): string {
  const base = getArcExplorerUrl().replace(/\/$/, "");
  return `${base}/tx/${hash}`;
}

export function getExplorerAddressUrl(address: `0x${string}`): string {
  const base = getArcExplorerUrl().replace(/\/$/, "");
  return `${base}/address/${address}`;
}

export async function getChainInfo(): Promise<{
  ok: boolean;
  chainId?: number;
  blockNumber?: bigint;
  error?: string;
}> {
  try {
    const client = getArcPublicClient();
    const [chainId, blockNumber] = await Promise.all([
      client.getChainId(),
      client.getBlockNumber(),
    ]);
    return { ok: true, chainId, blockNumber };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown RPC error",
    };
  }
}

export function resetArcClient() {
  cachedClient = null;
}
