import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AuditLogEntry,
  DEFAULT_RISK_SETTINGS,
  RiskSettings,
  TransactionRecord,
  Wallet,
  WalletBalance,
} from "@/types";
import { getEnv } from "@/lib/env";

type DB_CLIENT = SupabaseClient | null;

const env = getEnv();
const DATABASE_URL = env.DATABASE_URL;
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL;
const SUPABASE_ANON_KEY =
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY;

let cachedClient: DB_CLIENT = null;
let useInMemory = false;

const inMemoryDB = {
  transactions: new Map<string, TransactionRecord>(),
  auditLogs: [] as AuditLogEntry[],
  riskSettings: null as RiskSettings | null,
};

export function getDatabaseClient(): DB_CLIENT {
  if (useInMemory) return null;
  if (cachedClient) return cachedClient;
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    cachedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    return cachedClient;
  }
  if (DATABASE_URL) {
    return null;
  }
  useInMemory = true;
  return null;
}

export function isDatabaseEnabled(): boolean {
  return !useInMemory && (!!SUPABASE_URL || !!DATABASE_URL);
}

export async function saveTransaction(tx: TransactionRecord): Promise<void> {
  const client = getDatabaseClient();
  if (!client) {
    inMemoryDB.transactions.set(tx.id, tx);
    return;
  }
  try {
    await client
      .from("transactions")
      .upsert({
        id: tx.id,
        wallet_id: tx.walletId,
        wallet_label: tx.walletLabel,
        action: tx.action,
        amount_in: tx.amountIn.toString(),
        amount_out: tx.amountOut?.toString(),
        token_address: tx.tokenAddress,
        token_symbol: tx.tokenSymbol,
        destination: tx.destination,
        tx_hash: tx.txHash,
        status: tx.status,
        block_number: tx.blockNumber,
        gas_used: tx.gasUsed?.toString(),
        error: tx.error,
        created_at: tx.createdAt,
        submitted_at: tx.submittedAt,
        confirmed_at: tx.confirmedAt,
        nonce: tx.nonce,
      });
  } catch {
    // no-op
  }
}

export async function listTransactions(filter: {
  walletId?: string;
  action?: TransactionRecord["action"];
  status?: TransactionRecord["status"];
  from?: number;
  to?: number;
  limit?: number;
}): Promise<TransactionRecord[]> {
  const client = getDatabaseClient();
  if (!client) {
    const all = [...inMemoryDB.transactions.values()].sort(
      (a, b) => b.createdAt - a.createdAt
    );
    return all.filter((t) => {
      if (filter.walletId && t.walletId !== filter.walletId) return false;
      if (filter.action && t.action !== filter.action) return false;
      if (filter.status && t.status !== filter.status) return false;
      if (filter.from && t.createdAt < filter.from) return false;
      if (filter.to && t.createdAt > filter.to) return false;
      return true;
    }).slice(0, filter.limit ?? 100);
  }
  let q = client.from("transactions").select("*");
  if (filter.walletId) q = q.eq("wallet_id", filter.walletId);
  if (filter.action) q = q.eq("action", filter.action);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.from) q = q.gte("created_at", filter.from);
  if (filter.to) q = q.lte("created_at", filter.to);
  q = q.order("created_at", { ascending: false }).limit(filter.limit ?? 100);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id,
    walletId: r.wallet_id,
    walletLabel: r.wallet_label,
    action: r.action,
    amountIn: BigInt(r.amount_in),
    amountOut: r.amount_out ? BigInt(r.amount_out) : undefined,
    tokenAddress: r.token_address,
    tokenSymbol: r.token_symbol,
    destination: r.destination,
    txHash: r.tx_hash,
    status: r.status,
    blockNumber: r.block_number,
    gasUsed: r.gas_used ? BigInt(r.gas_used) : undefined,
    error: r.error,
    createdAt: r.created_at,
    submittedAt: r.submitted_at,
    confirmedAt: r.confirmed_at,
    nonce: r.nonce,
  })) as TransactionRecord[];
}

export async function saveAuditLog(entry: AuditLogEntry): Promise<void> {
  const client = getDatabaseClient();
  if (!client) {
    inMemoryDB.auditLogs.push(entry);
    return;
  }
  try {
    await client
      .from("audit_logs")
      .insert({
        id: entry.id,
        timestamp: entry.timestamp,
        user_id: entry.userId,
        wallet_id: entry.walletId,
        wallet_label: entry.walletLabel,
        action: entry.action,
        amount: entry.amount?.toString(),
        destination: entry.destination,
        tx_hash: entry.txHash,
        status: entry.status,
        meta: entry.meta,
      });
  } catch {
    // no-op
  }
}

export async function getRiskSettings(
  defaults: typeof DEFAULT_RISK_SETTINGS
): Promise<RiskSettings> {
  const client = getDatabaseClient();
  if (!client) return inMemoryDB.riskSettings ?? defaults;
  const { data, error } = await client
    .from("risk_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error || !data) return defaults;
  return {
    maxTradeAmountUSDC: BigInt(data.max_trade_amount_usdc),
    maxDailySpendUSDC: BigInt(data.max_daily_spend_usdc),
    maxTokenExposurePercent: data.max_token_exposure_percent,
    maxSlippageBps: data.max_slippage_bps,
    maxPriceImpactBps: data.max_price_impact_bps,
    minLiquidityUSDC: BigInt(data.min_liquidity_usdc),
    minGasReserveUSDC: BigInt(data.min_gas_reserve_usdc),
  };
}

export async function saveRiskSettings(s: RiskSettings): Promise<void> {
  const client = getDatabaseClient();
  if (!client) {
    inMemoryDB.riskSettings = s;
    return;
  }
  try {
    await client
      .from("risk_settings")
      .upsert({
        id: "singleton",
        max_trade_amount_usdc: s.maxTradeAmountUSDC.toString(),
        max_daily_spend_usdc: s.maxDailySpendUSDC.toString(),
        max_token_exposure_percent: s.maxTokenExposurePercent,
        max_slippage_bps: s.maxSlippageBps,
        max_price_impact_bps: s.maxPriceImpactBps,
        min_liquidity_usdc: s.minLiquidityUSDC.toString(),
        min_gas_reserve_usdc: s.minGasReserveUSDC.toString(),
      });
  } catch {
    // no-op
  }
}

export type { Wallet, WalletBalance };
