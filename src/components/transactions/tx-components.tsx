import type { TransactionRecord } from "@/types";
import { TxStatusBadge } from "@/components/ui/status-badges";
import { ExplorerLink } from "@/components/ui/explorer-link";
import { formatUSDC } from "@/lib/blockchain/gas";
import { formatBigInt, formatDateTime, shortAddress } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function TransactionTable({
  transactions,
}: {
  transactions: TransactionRecord[];
}) {
  if (transactions.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground text-sm">
          No transactions yet. Operations will appear here after submission.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/30">
          <tr>
            <th className="terminal-th">Time</th>
            <th className="terminal-th">Action</th>
            <th className="terminal-th">Wallet</th>
            <th className="terminal-th">Amount</th>
            <th className="terminal-th">Token</th>
            <th className="terminal-th">Destination</th>
            <th className="terminal-th">Status</th>
            <th className="terminal-th">TX</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id} className="terminal-tr">
              <td className="terminal-td text-xs text-muted-foreground whitespace-nowrap">
                {formatDateTime(tx.createdAt)}
              </td>
              <td className="terminal-td">
                <Badge
                  variant={
                    tx.action === "BUY"
                      ? "success"
                      : tx.action === "SELL"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {tx.action}
                </Badge>
              </td>
              <td className="terminal-td text-sm font-bold tracking-wider">
                {tx.walletLabel}
              </td>
              <td className="terminal-td font-mono text-sm">
                {formatUSDC(tx.amountIn, 2)}
                {tx.amountOut && (
                  <span className="text-muted-foreground">
                    {" → "}
                    {tx.tokenSymbol
                      ? formatBigInt(tx.amountOut, tx.tokenSymbol === "USDC" ? 6 : 18, 4)
                      : formatBigInt(tx.amountOut, 18, 4)}
                  </span>
                )}
              </td>
              <td className="terminal-td font-mono text-xs">
                {tx.tokenSymbol ?? (
                  <span className="text-muted-foreground">NATIVE</span>
                )}
                {tx.tokenAddress && (
                  <>
                    {" "}
                    <span className="text-muted-foreground">
                      ({shortAddress(tx.tokenAddress)})
                    </span>
                  </>
                )}
              </td>
              <td className="terminal-td font-mono text-xs">
                {tx.destination ? (
                  <ExplorerLink hash={tx.destination} type="address" />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="terminal-td">
                <TxStatusBadge status={tx.status} />
              </td>
              <td className="terminal-td">
                {tx.txHash ? (
                  <ExplorerLink hash={tx.txHash} type="tx" />
                ) : (
                  <span className="text-muted-foreground text-xs">
                    Not submitted
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TransactionStatusPanel({
  tx,
}: {
  tx: TransactionRecord | null;
}) {
  if (!tx) return null;
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest font-bold text-foreground/80">
            Transaction Status
          </div>
          <TxStatusBadge status={tx.status} />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="stat-label">Wallet</div>
            <div className="font-bold tracking-wider">{tx.walletLabel}</div>
          </div>
          <div>
            <div className="stat-label">Action</div>
            <div className="font-mono">{tx.action}</div>
          </div>
          <div className="col-span-2">
            <div className="stat-label">TX Hash</div>
            <div>
              {tx.txHash ? (
                <ExplorerLink hash={tx.txHash} type="tx" />
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
          </div>
          {tx.blockNumber !== undefined && (
            <div>
              <div className="stat-label">Block</div>
              <div className="font-mono">{tx.blockNumber}</div>
            </div>
          )}
          {tx.gasUsed !== undefined && (
            <div>
              <div className="stat-label">Gas Used</div>
              <div className="font-mono">
                {formatUSDC(tx.gasUsed, 4)} USDC
              </div>
            </div>
          )}
        </div>
        {tx.error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive space-y-1">
            <div className="font-bold uppercase tracking-wider">
              Transaction failed
            </div>
            <div className="text-xs leading-relaxed">
              The swap/transfer could not be completed. Possible reasons:
              insufficient liquidity, slippage exceeded, insufficient gas, or
              contract reverted.
            </div>
            <div className="font-mono pt-1 border-t border-destructive/20 mt-2">
              {tx.error}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
