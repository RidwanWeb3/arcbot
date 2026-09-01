"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TransactionTable } from "@/components/transactions/tx-components";
import {
  Receipt,
  RefreshCw,
  Search,
  Download,
} from "lucide-react";
import type { TransactionRecord, Wallet } from "@/types";
import { TxStatusBadge } from "@/components/ui/status-badges";
import { formatDateTime } from "@/lib/utils";

type TxAction = TransactionRecord["action"];
type TxStatus = TransactionRecord["status"];

const ACTIONS: TxAction[] = ["BUY", "SELL", "DISTRIBUTION", "COLLECT", "TRANSFER"];
const STATUSES: TxStatus[] = [
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
];

export default function TransactionsPage() {
  const [walletId, setWalletId] = useState<string>("");
  const [action, setAction] = useState<TxAction | "">("");
  const [status, setStatus] = useState<TxStatus | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  const { data: walletsData } = useQuery({
    queryKey: ["wallets-tx"],
    queryFn: async () => {
      const r = await fetch("/api/wallets").then((x) => x.json());
      return r as { wallets: Wallet[] };
    },
  });

  const params = useMemo(() => {
    const p: Record<string, string> = { limit: "500" };
    if (walletId) p.walletId = walletId;
    if (action) p.action = action;
    if (status) p.status = status;
    if (from) {
      const d = new Date(from);
      if (!isNaN(d.valueOf())) p.from = String(Math.floor(d.getTime() / 1000) * 1000);
    }
    if (to) {
      const d = new Date(to);
      if (!isNaN(d.valueOf())) p.to = String(Math.floor(d.getTime() / 1000) * 1000);
    }
    return p;
  }, [walletId, action, status, from, to]);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["transactions", params],
    queryFn: async () => {
      const q = new URLSearchParams(params).toString();
      const r = await fetch(`/api/transactions?${q}`).then((x) => x.json());
      return r as { transactions: TransactionRecord[] };
    },
    refetchInterval: 20_000,
  });
  const wallets = walletsData?.wallets ?? [];
  const transactions = (data?.transactions ?? []).filter((tx) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      tx.txHash?.toLowerCase().includes(s) ||
      tx.tokenAddress?.toLowerCase().includes(s) ||
      tx.destination?.toLowerCase().includes(s) ||
      tx.walletLabel.toLowerCase().includes(s) ||
      tx.tokenSymbol?.toLowerCase().includes(s) ||
      tx.action.toLowerCase().includes(s)
    );
  });

  const summary = useMemo(() => {
    const buys = transactions.filter((t) => t.action === "BUY").length;
    const sells = transactions.filter((t) => t.action === "SELL").length;
    const pending = transactions.filter(
      (t) =>
        t.status === "SUBMITTED" ||
        t.status === "CONFIRMING" ||
        t.status === "READY"
    ).length;
    const failed = transactions.filter(
      (t) => t.status === "FAILED" || t.status === "REVERTED"
    ).length;
    return { buys, sells, pending, failed };
  }, [transactions]);

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-primary font-bold">
            ACTIVITY · TRANSACTIONS
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
            Transactions
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Full operations log with per-transaction status, explorer links, and
            filters for wallet, action, token, and date.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild variant="outline">
            <a
              href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(transactions, null, 2))}`}
              download={`arc-transactions-${Date.now()}.json`}
              target="_blank"
              rel="noreferrer"
            >
              <Download className="h-3.5 w-3.5" />
              Export JSON
            </a>
          </Button>
          <Button
            variant="outline"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Total" value={`${transactions.length}`} icon={<Receipt className="h-4 w-4" />} />
        <Stat label="Buys" value={`${summary.buys}`} tone="text-success" />
        <Stat label="Sells" value={`${summary.sells}`} tone="text-destructive" />
        <Stat
          label="Pending"
          value={`${summary.pending}`}
          tone={summary.pending > 0 ? "text-warning" : "text-muted-foreground"}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="space-y-1.5">
            <Label>Wallet</Label>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger>
                <SelectValue placeholder="All wallets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All wallets</SelectItem>
                {wallets.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Action</Label>
            <Select value={action} onValueChange={(v) => setAction(v as TxAction | "")}>
              <SelectTrigger>
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All actions</SelectItem>
                {ACTIONS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as TxStatus | "")}>
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    <TxStatusBadge status={s} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Search</Label>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Hash / address / label…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div>
            Showing {transactions.length} of {data?.transactions?.length ?? 0} ·
            Last updated {formatDateTime(Date.now())}
          </div>
          <div>Polling every 20s</div>
        </div>
        <TransactionTable transactions={transactions} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="stat-label">{label}</div>
          {icon && (
            <div className="h-8 w-8 rounded-md border border-border bg-muted/40 flex items-center justify-center text-muted-foreground">
              {icon}
            </div>
          )}
        </div>
        <div className={`stat-value ${tone ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
