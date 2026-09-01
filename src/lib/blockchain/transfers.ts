import {
  createSigningContext,
  sendNativeTransfer,
  type NativeTransferResult,
} from "./swaps";
import type { DistributionItem, Hex } from "@/types";

export interface TransferExecutionResult {
  walletId: string;
  to: Hex;
  amount: bigint;
  result: NativeTransferResult;
}

export async function executeTransfersSequential(params: {
  privateKey: Hex;
  items: DistributionItem[];
}): Promise<TransferExecutionResult[]> {
  const ctx = createSigningContext(params.privateKey);
  const results: TransferExecutionResult[] = [];
  for (const item of params.items) {
    const result = await sendNativeTransfer({
      ctx,
      to: item.address,
      amount: item.amount,
    });
    results.push({
      walletId: item.walletId,
      to: item.address,
      amount: item.amount,
      result,
    });
    if (!result.success) {
      break;
    }
  }
  return results;
}
