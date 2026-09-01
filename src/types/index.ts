export type Hex = `0x${string}`;

export const isHex = (value: string): value is Hex => /^0x[0-9a-fA-F]*$/.test(value);

export type WalletStatus = "READY" | "LOW_BALANCE" | "LOW_GAS" | "DISABLED" | "ERROR";

export interface Wallet {
  id: string;
  label: string;
  index: number;
  address: Hex;
  status: WalletStatus;
  createdAt: number;
  lastActivityAt?: number;
  enabled: boolean;
}

export interface WalletBalance {
  walletId: string;
  nativeUSDC: bigint;
  gasReserve: bigint;
  safeSpendable: bigint;
  safeCollectable: bigint;
  updatedAt: number;
}

export interface WalletWithBalance extends Wallet {
  balance?: WalletBalance;
}

export type TxAction = "BUY" | "SELL" | "DISTRIBUTION" | "COLLECT" | "TRANSFER";
export type TxStatus =
  | "CREATED"
  | "SIMULATING"
  | "READY"
  | "SUBMITTING"
  | "SUBMITTED"
  | "CONFIRMING"
  | "CONFIRMED"
  | "FAILED"
  | "REVERTED"
  | "CANCELLED";

export interface TransactionRecord {
  id: string;
  walletId: string;
  walletLabel: string;
  action: TxAction;
  amountIn: bigint;
  amountOut?: bigint;
  tokenAddress?: Hex;
  tokenSymbol?: string;
  destination?: Hex;
  txHash?: Hex;
  status: TxStatus;
  blockNumber?: number;
  gasUsed?: bigint;
  error?: string;
  createdAt: number;
  submittedAt?: number;
  confirmedAt?: number;
  nonce?: number;
}

export interface DistributionItem {
  walletId: string;
  address: Hex;
  amount: bigint;
}

export interface DistributionPreview {
  sourceWalletId: string;
  sourceAddress: Hex;
  items: DistributionItem[];
  total: bigint;
  estimatedGas: bigint;
  perTransferGas: bigint;
  remainingAfter: bigint;
  botFee: bigint;
  valid: boolean;
  errors: string[];
}

export interface CollectPreview {
  treasuryAddress: Hex;
  treasuryWalletId: string;
  items: DistributionItem[];
  totalBalance: bigint;
  totalGasReserve: bigint;
  safeCollection: bigint;
  perTransferGas: bigint;
  estimatedGas: bigint;
  finalTreasuryBalance: bigint;
  botFee: bigint;
  valid: boolean;
  errors: string[];
}

export interface TokenInfo {
  address: Hex;
  symbol: string;
  name: string;
  decimals: number;
  totalSupply: bigint;
  liquidityUSDC?: bigint;
  hasRoute: boolean;
  verified: boolean;
  error?: string;
}

export interface TradeQuote {
  tokenAddress: Hex;
  tokenSymbol: string;
  tokenDecimals: number;
  direction: "BUY" | "SELL";
  inputAmount: bigint;
  inputSymbol: string;
  expectedOutput: bigint;
  expectedOutputSymbol: string;
  minimumOutput: bigint;
  priceImpactBps: number;
  estimatedGas: bigint;
  dexFee: bigint;
  botFee: bigint;
  route: string;
  slippageBps: number;
  error?: string;
}

export interface RiskSettings {
  maxTradeAmountUSDC: bigint;
  maxDailySpendUSDC: bigint;
  maxTokenExposurePercent: number;
  maxSlippageBps: number;
  maxPriceImpactBps: number;
  minLiquidityUSDC: bigint;
  minGasReserveUSDC: bigint;
}

export interface BulkTradeItem {
  walletId: string;
  amount: bigint;
  tokenBalance?: bigint;
  quote?: TradeQuote;
  risk?: { ok: boolean; errors: string[]; warnings: string[] };
  error?: string;
}

export interface BulkTradePreview {
  direction: "BUY" | "SELL";
  tokenAddress: Hex;
  tokenSymbol: string;
  tokenDecimals: number;
  slippageBps: number;
  items: BulkTradeItem[];
  totalInput: bigint;
  totalInputSymbol: string;
  totalExpectedOutput: bigint;
  totalExpectedOutputSymbol: string;
  totalEstimatedGas: bigint;
  totalDexFee: bigint;
  validItems: number;
  totalItems: number;
  errors: string[];
}

export interface BulkTradeResult {
  walletId: string;
  amount: string;
  success: boolean;
  txHash?: string;
  error?: string;
  blockNumber?: number;
  gasUsed?: string;
  amountOut?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  userId?: string;
  walletId?: string;
  walletLabel?: string;
  action: string;
  amount?: bigint;
  destination?: Hex;
  txHash?: Hex;
  status: string;
  meta?: Record<string, unknown>;
}

export const DEFAULT_RISK_SETTINGS: RiskSettings = {
  maxTradeAmountUSDC: 5000_000000n,
  maxDailySpendUSDC: 25000_000000n,
  maxTokenExposurePercent: 10,
  maxSlippageBps: 200,
  maxPriceImpactBps: 500,
  minLiquidityUSDC: 10000_000000n,
  minGasReserveUSDC: 100000n,
};
