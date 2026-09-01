"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BalanceCard } from "@/components/balance/balance-card";
import { WalletGrid } from "@/components/wallets/wallet-components";
import { TransactionTable } from "@/components/transactions/tx-components";
import { Button } from "@/components/ui/button";
import {
  Wallet as WalletIcon,
  Banknote,
  Coins,
  Clock,
  Activity,
  Fuel,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowRightLeft,
  Receipt,
  Settings,
} from "lucide-react";
import { formatUSDC } from "@/lib/blockchain/gas";
import type {
  TransactionRecord,
  Wallet,
  WalletBalance,
} from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  const { data: walletsData } = useQuery({
    queryKey: ["wallets-full"],
    queryFn: async () => {
      const r = await fetch("/api/wallets?balances=1").then((x) => x.json());
      return r as {
        wallets: Wallet[];
        balances: Record<string, WalletBalance>;
      };
    },
    refetchInterval: 20_000,
  });

  const { data: txData } = useQuery({
    queryKey: ["tx-dashboard"],
    queryFn: async () => {
      const r = await fetch("/api/transactions?limit=10").then((x) => x.json());
      return r as { transactions: TransactionRecord[]; today: { buys: bigint; sells: bigint; count: number } };
    },
    refetchInterval: 15_000,
  });

  const wallets = walletsData?.wallets ?? [];
  const balances = walletsData?.balances ?? {};

  const totalTreasury = wallets.reduce(
    (acc, w) => acc + (balances[w.id]?.nativeUSDC ?? 0n),
    0n
  );
  const totalSafe = wallets.reduce(
    (acc, w) => acc + (balances[w.id]?.safeSpendable ?? 0n),
    0n
  );
  const totalGasReserve = wallets.reduce(
    (acc, w) => acc + (balances[w.id]?.gasReserve ?? 0n),
    0n
  );
  const activeCount = wallets.filter((w) => w.enabled).length;
  const pendingCount = (txData?.transactions ?? []).filter(
    (t) =>
      t.status === "SUBMITTED" ||
      t.status === "CONFIRMING" ||
      t.status === "SUBMITTING" ||
      t.status === "READY"
  ).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-primary font-bold">
            ARC TRADING TERMINAL
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Authorized treasury operations console for ARC Mainnet multi-wallet
            management, USDC gas accounting, DEX trading, and balance
            collection.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="cta" variant="success">
            <Link href="/wallets">
              <WalletIcon className="h-3.5 w-3.5" /> Manage Wallets
            </Link>
          </Button>
          <Button asChild size="cta" variant="default">
            <Link href="/distribution">
              <ArrowDownToLine className="h-3.5 w-3.5" /> Distribute USDC
            </Link>
          </Button>
          <Button asChild size="cta" variant="default">
            <Link href="/trading">
              <ArrowRightLeft className="h-3.5 w-3.5" /> Trade
            </Link>
          </Button>
          <Button asChild size="cta" variant="warning">
            <Link href="/collect">
              <ArrowUpFromLine className="h-3.5 w-3.5" /> Collect
            </Link>
          </Button>
          <Button asChild size="cta" variant="outline">
            <Link href="/transactions">
              <Receipt className="h-3.5 w-3.5" /> Transactions
            </Link>
          </Button>
          <Button asChild size="cta" variant="ghost">
            <Link href="/settings">
              <Settings className="h-3.5 w-3.5" /> Settings
            </Link>
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <BalanceCard
          label="Total Treasury"
          value={`${formatUSDC(totalTreasury, 2)} USDC`}
          tone="success"
          icon={<Banknote className="h-4 w-4" />}
          sub={`${wallets.length} authorized wallets`}
        />
        <BalanceCard
          label="Wallets"
          value={`${activeCount} / ${wallets.length}`}
          tone="default"
          icon={<WalletIcon className="h-4 w-4" />}
          sub="Active / Total"
        />
        <BalanceCard
          label="Available USDC"
          value={`${formatUSDC(totalSafe, 2)} USDC`}
          tone="success"
          icon={<Coins className="h-4 w-4" />}
          sub="Aggregate safe spendable"
        />
        <BalanceCard
          label="Pending"
          value={`${pendingCount}`}
          tone={pendingCount > 0 ? "warning" : "muted"}
          icon={<Clock className="h-4 w-4" />}
          sub="On-chain confirmations"
        />
        <BalanceCard
          label="Today's Trading"
          value={`${txData?.today?.count ?? 0} TX`}
          tone="default"
          icon={<Activity className="h-4 w-4" />}
          sub={`BUY ${formatUSDC(txData?.today?.buys ?? 0n, 0)} · SELL ${formatUSDC(
            txData?.today?.sells ?? 0n,
            0
          )} USDC`}
        />
        <BalanceCard
          label="Gas Reserve"
          value={`${formatUSDC(totalGasReserve, 4)} USDC`}
          tone="warning"
          icon={<Fuel className="h-4 w-4" />}
          sub="Protected for network fees"
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Wallet Pool
            </h2>
            <Badge variant="muted">{wallets.length} wallets</Badge>
          </div>
          <WalletGrid
            wallets={wallets.slice(0, 8)}
            balances={balances}
            onAction={() => {
              window.location.href = "/wallets";
            }}
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <TransactionTable transactions={txData?.transactions ?? []} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
