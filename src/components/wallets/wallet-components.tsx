import type {
  Wallet,
  WalletBalance,
  WalletWithBalance,
} from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WalletStatusBadge } from "@/components/ui/status-badges";
import { shortAddress, cn } from "@/lib/utils";
import { formatUSDC } from "@/lib/blockchain/gas";
import { ArrowRightLeft, Banknote, Eye, Send, ArrowUpFromLine } from "lucide-react";
import { ExplorerLink } from "@/components/ui/explorer-link";

export function WalletCard({
  wallet,
  balance,
  onAction,
}: {
  wallet: Wallet;
  balance?: WalletBalance;
  onAction: (action: string, w: Wallet) => void;
}) {
  const bal = balance;
  return (
    <Card className="terminal-card-hover group">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-wider text-foreground/90">
                {wallet.label}
              </span>
              <WalletStatusBadge status={wallet.status} />
            </div>
            <ExplorerLink
              hash={wallet.address}
              type="address"
              className="text-[11px]"
            />
          </div>
          <Badge
            variant="muted"
            className="font-mono text-[10px] tracking-wide"
          >
            #{String(wallet.index).padStart(2, "0")}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-1">
          <div>
            <div className="stat-label">Native USDC</div>
            <div className="stat-value text-sm text-foreground">
              {bal ? formatUSDC(bal.nativeUSDC, 2) : "—"}
            </div>
          </div>
          <div>
            <div className="stat-label">Gas Reserve</div>
            <div className="stat-value text-sm text-warning">
              {bal ? formatUSDC(bal.gasReserve, 4) : "—"}
            </div>
          </div>
          <div>
            <div className="stat-label">Safe Spendable</div>
            <div className={cn("stat-value text-sm", bal && bal.safeSpendable > 0 ? "text-success" : "text-muted-foreground")}>
              {bal ? formatUSDC(bal.safeSpendable, 2) : "—"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button
            size="sm"
            variant="success"
            className="flex-1 min-w-[70px]"
            disabled={!wallet.enabled || (bal && bal.safeSpendable === 0n)}
            onClick={() => onAction("trade", wallet)}
          >
            <ArrowRightLeft className="h-3 w-3" /> Trade
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 min-w-[70px]"
            disabled={!wallet.enabled}
            onClick={() => onAction("transfer", wallet)}
          >
            <Send className="h-3 w-3" /> Transfer
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 min-w-[70px]"
            onClick={() => onAction("view", wallet)}
          >
            <Eye className="h-3 w-3" /> View
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function WalletGrid({
  wallets,
  balances,
  onAction,
}: {
  wallets: Wallet[];
  balances: Record<string, WalletBalance>;
  onAction: (action: string, w: Wallet) => void;
}) {
  if (wallets.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          <Banknote className="h-10 w-10 mx-auto mb-3 opacity-40" />
          No wallets yet. Create or import authorized wallets to begin.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
      {wallets.map((w) => (
        <WalletCard
          key={w.id}
          wallet={w}
          balance={balances[w.id]}
          onAction={onAction}
        />
      ))}
    </div>
  );
}

export function WalletTableRow({
  wallet,
  balance,
  onAction,
}: {
  wallet: Wallet;
  balance?: WalletBalance;
  onAction: (action: string, w: Wallet) => void;
}) {
  return (
    <tr className="terminal-tr">
      <td className="terminal-td">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm tracking-wider">
            {wallet.label}
          </span>
          <Badge variant="muted" className="font-mono text-[10px]">
            #{String(wallet.index).padStart(2, "0")}
          </Badge>
        </div>
      </td>
      <td className="terminal-td font-mono text-xs">
        <ExplorerLink hash={wallet.address} type="address" />
      </td>
      <td className="terminal-td font-mono text-sm">
        {balance ? formatUSDC(balance.nativeUSDC, 2) : "—"} USDC
      </td>
      <td className="terminal-td font-mono text-sm text-warning">
        {balance ? formatUSDC(balance.gasReserve, 4) : "—"}
      </td>
      <td className="terminal-td font-mono text-sm text-success">
        {balance ? formatUSDC(balance.safeSpendable, 2) : "—"}
      </td>
      <td className="terminal-td">
        <WalletStatusBadge status={wallet.status} />
      </td>
      <td className="terminal-td text-xs text-muted-foreground">
        {wallet.lastActivityAt
          ? new Date(wallet.lastActivityAt).toLocaleString()
          : "—"}
      </td>
      <td className="terminal-td">
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onAction("view", wallet)}
          >
            View
          </Button>
          <Button
            size="sm"
            variant={wallet.enabled ? "secondary" : "success"}
            onClick={() =>
              onAction(wallet.enabled ? "disable" : "enable", wallet)
            }
          >
            {wallet.enabled ? "Disable" : "Enable"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAction("rename", wallet)}
          >
            Rename
          </Button>
          <Button
            size="sm"
            variant="success"
            disabled={!wallet.enabled || (balance && balance.safeSpendable === 0n)}
            onClick={() => onAction("trade", wallet)}
          >
            Trade
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!wallet.enabled}
            onClick={() => onAction("transfer", wallet)}
          >
            Transfer
          </Button>
          <Button
            size="sm"
            variant="warning"
            disabled={!wallet.enabled || !balance || balance.safeCollectable === 0n}
            onClick={() => onAction("collect", wallet)}
          >
            <ArrowUpFromLine className="h-3 w-3" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
