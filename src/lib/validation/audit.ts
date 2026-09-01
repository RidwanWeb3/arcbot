import type { AuditLogEntry, Hex, TxAction, TxStatus } from "@/types";
import { saveAuditLog } from "@/lib/database/client";
import { generateId } from "@/lib/utils";

export async function writeAudit(params: {
  action: string;
  status: string;
  walletId?: string;
  walletLabel?: string;
  amount?: bigint;
  destination?: Hex;
  txHash?: Hex;
  userId?: string;
  meta?: Record<string, unknown>;
}): Promise<AuditLogEntry> {
  const entry: AuditLogEntry = {
    id: generateId("aud_"),
    timestamp: Date.now(),
    userId: params.userId,
    walletId: params.walletId,
    walletLabel: params.walletLabel,
    action: params.action,
    amount: params.amount,
    destination: params.destination,
    txHash: params.txHash,
    status: params.status,
    meta: params.meta,
  };
  await saveAuditLog(entry);
  return entry;
}

export function txActionLabel(a: TxAction): string {
  return a;
}

export function txStatusLabel(s: TxStatus): string {
  return s;
}
