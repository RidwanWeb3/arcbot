import { z } from "zod";

export const hexRegex = /^0x[0-9a-fA-F]{40}$/;
export const txHashRegex = /^0x[0-9a-fA-F]{64}$/;

export const HexAddressSchema = z
  .string()
  .regex(hexRegex, "Invalid EVM address");

export const HexHashSchema = z.string().regex(txHashRegex, "Invalid tx hash");

export const WalletLabelSchema = z
  .string()
  .min(1, "Label required")
  .max(32, "Label too long")
  .regex(/^[A-Za-z0-9_\- ]+$/, "Invalid characters");

export const CreateWalletSchema = z.object({
  label: WalletLabelSchema,
});

export const ImportWalletSchema = z.object({
  label: WalletLabelSchema,
  privateKey: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid private key"),
  confirm: z.boolean().refine((v) => v === true, "Must confirm import"),
});

export const RenameWalletSchema = z.object({
  walletId: z.string().min(1),
  label: WalletLabelSchema,
});

export const BigIntUSDCString = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/, "Invalid USDC amount (max 6 decimals)")
  .transform((v) => {
    const [int, dec = ""] = v.split(".");
    const padded = (dec + "000000").slice(0, 6);
    return BigInt(int + padded);
  });

export const DistributionItemSchema = z.object({
  walletId: z.string().min(1),
  address: HexAddressSchema,
  amount: BigIntUSDCString.refine((v) => v > 0n, "Amount must be > 0"),
});

export const DistributionExecuteSchema = z.object({
  sourceWalletId: z.string().min(1),
  items: z.array(DistributionItemSchema).min(1, "At least one recipient"),
});

export const CollectExecuteSchema = z.object({
  treasuryWalletId: z.string().min(1),
  walletIds: z.array(z.string().min(1)).min(1, "Select at least one wallet"),
});

export const TokenAddressSchema = z.object({
  address: HexAddressSchema,
});

export const TradeQuoteSchema = z.object({
  walletId: z.string().min(1),
  tokenAddress: HexAddressSchema,
  direction: z.enum(["BUY", "SELL"]),
  amount: BigIntUSDCString.refine((v) => v > 0n, "Amount must be > 0"),
  slippageBps: z
    .number()
    .int()
    .min(1, "Min slippage 1 bps")
    .max(5000, "Max slippage 50%"),
});

export const TradeExecuteSchema = TradeQuoteSchema.extend({
  confirm: z.boolean().refine((v) => v === true, "Must confirm trade"),
});

export const RiskSettingsSchema = z.object({
  maxTradeAmountUSDC: z.bigint().min(0n),
  maxDailySpendUSDC: z.bigint().min(0n),
  maxTokenExposurePercent: z.number().int().min(0).max(100),
  maxSlippageBps: z.number().int().min(0).max(10000),
  maxPriceImpactBps: z.number().int().min(0).max(10000),
  minLiquidityUSDC: z.bigint().min(0n),
  minGasReserveUSDC: z.bigint().min(0n),
});

export const TxFilterSchema = z.object({
  walletId: z.string().optional(),
  action: z
    .enum(["BUY", "SELL", "DISTRIBUTION", "COLLECT", "TRANSFER"])
    .optional(),
  status: z
    .enum([
      "CREATED",
      "SIMULATING",
      "READY",
      "SUBMITTING",
      "SUBMITTED",
      "CONFIRMING",
      "CONFIRMED",
      "FAILED",
      "REVERTED",
      "CANCELLED",
    ])
    .optional(),
  from: z.number().int().positive().optional(),
  to: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(500).default(100).optional(),
});
