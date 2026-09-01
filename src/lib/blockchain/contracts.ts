import type { Hex } from "viem";

const DEFAULT_USDC = "0x3600000000000000000000000000000000000000" as const;
const DEFAULT_UNISWAP_V3_FACTORY =
  "0xf0db7b58379503491d857db50ac9ece64c653918" as const;
const DEFAULT_POSITION_MANAGER =
  "0x39654a85a4c05127f5fd6ed22caec077a0fb1377" as const;
const DEFAULT_SWAP_ROUTER =
  "0x53bf6b0684ec7ef91e1387da3d1a1769bc5a6f77" as const;
const DEFAULT_MULTICALL3 =
  "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

function pickEnvOrDefault(
  key:
    | "ARC_USDC_ADDRESS"
    | "ARC_UNISWAP_V3_FACTORY"
    | "ARC_POSITION_MANAGER"
    | "ARC_SWAP_ROUTER"
    | "ARC_MULTICALL3_ADDRESS",
  fallback: string
): string {
  if (typeof process !== "undefined" && process.env && process.env[key]) {
    return process.env[key] as string;
  }
  return fallback;
}

export const ARC_CONTRACTS = {
  USDC: pickEnvOrDefault("ARC_USDC_ADDRESS", DEFAULT_USDC) as Hex,
  UNISWAP_V3_FACTORY: pickEnvOrDefault(
    "ARC_UNISWAP_V3_FACTORY",
    DEFAULT_UNISWAP_V3_FACTORY
  ) as Hex,
  POSITION_MANAGER: pickEnvOrDefault(
    "ARC_POSITION_MANAGER",
    DEFAULT_POSITION_MANAGER
  ) as Hex,
  SWAP_ROUTER: pickEnvOrDefault("ARC_SWAP_ROUTER", DEFAULT_SWAP_ROUTER) as Hex,
  MULTICALL3: pickEnvOrDefault(
    "ARC_MULTICALL3_ADDRESS",
    DEFAULT_MULTICALL3
  ) as Hex,
} as const;

export const NATIVE_USDC_DECIMALS = 6;
export const USDC_SYMBOL = "USDC";
export const BOT_FEE = 0n;

export const ERC20_ABI = [
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [{ name: "", type: "string", internalType: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string", internalType: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8", internalType: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [
      { name: "account", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address", internalType: "address" },
      { name: "spender", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transferFrom",
    inputs: [
      { name: "from", type: "address", internalType: "address" },
      { name: "to", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

export const UNISWAP_V3_FACTORY_ABI = [
  {
    type: "function",
    name: "getPool",
    inputs: [
      { name: "tokenA", type: "address", internalType: "address" },
      { name: "tokenB", type: "address", internalType: "address" },
      { name: "fee", type: "uint24", internalType: "uint24" },
    ],
    outputs: [{ name: "pool", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "feeAmountTickSpacing",
    inputs: [
      { name: "fee", type: "uint24", internalType: "uint24" },
    ],
    outputs: [
      { name: "tickSpacing", type: "int24", internalType: "int24" },
    ],
    stateMutability: "view",
  },
] as const;

export const UNISWAP_V3_POOL_ABI = [
  {
    type: "function",
    name: "slot0",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160", internalType: "uint160" },
      { name: "tick", type: "int24", internalType: "int24" },
      { name: "observationIndex", type: "uint16", internalType: "uint16" },
      { name: "observationCardinality", type: "uint16", internalType: "uint16" },
      { name: "observationCardinalityNext", type: "uint16", internalType: "uint16" },
      { name: "feeProtocol", type: "uint8", internalType: "uint8" },
      { name: "unlocked", type: "bool", internalType: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "liquidity",
    inputs: [],
    outputs: [{ name: "", type: "uint128", internalType: "uint128" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "token0",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "token1",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "fee",
    inputs: [],
    outputs: [{ name: "", type: "uint24", internalType: "uint24" }],
    stateMutability: "view",
  },
] as const;

export const UNISWAP_V3_SWAP_ROUTER_ABI = [
  {
    type: "function",
    name: "exactInputSingle",
    inputs: [
      {
        name: "params",
        type: "tuple",
        internalType: "struct ISwapRouter.ExactInputSingleParams",
        components: [
          { name: "tokenIn", type: "address", internalType: "address" },
          { name: "tokenOut", type: "address", internalType: "address" },
          { name: "fee", type: "uint24", internalType: "uint24" },
          { name: "recipient", type: "address", internalType: "address" },
          { name: "deadline", type: "uint256", internalType: "uint256" },
          { name: "amountIn", type: "uint256", internalType: "uint256" },
          {
            name: "amountOutMinimum",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "sqrtPriceLimitX96",
            type: "uint160",
            internalType: "uint160",
          },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "exactOutputSingle",
    inputs: [
      {
        name: "params",
        type: "tuple",
        internalType: "struct ISwapRouter.ExactOutputSingleParams",
        components: [
          { name: "tokenIn", type: "address", internalType: "address" },
          { name: "tokenOut", type: "address", internalType: "address" },
          { name: "fee", type: "uint24", internalType: "uint24" },
          { name: "recipient", type: "address", internalType: "address" },
          { name: "deadline", type: "uint256", internalType: "uint256" },
          { name: "amountOut", type: "uint256", internalType: "uint256" },
          {
            name: "amountInMaximum",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "sqrtPriceLimitX96",
            type: "uint160",
            internalType: "uint160",
          },
        ],
      },
    ],
    outputs: [
      { name: "amountIn", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "payable",
  },
] as const;

export const UNISWAP_V3_FEE_TIERS = [100, 500, 3000, 10000] as const;
export type UniswapFeeTier = (typeof UNISWAP_V3_FEE_TIERS)[number];

export const DEX_FEE_BPS_MAP: Record<UniswapFeeTier, number> = {
  100: 1,
  500: 5,
  3000: 30,
  10000: 100,
};
