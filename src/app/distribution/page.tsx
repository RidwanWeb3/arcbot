"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RiskWarning } from "@/components/trading/trade-components";
import { ExplorerLink } from "@/components/ui/explorer-link";
import {
  ArrowDownToLine,
  ArrowRight,
  Building2,
  Coins,
  Fuel,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";
import type {
  DistributionItem,
  DistributionPreview,
  Wallet,
  WalletBalance,
} from "@/types";
import { formatUSDC, parseUSDC } from "@/lib/blockchain/gas";
import { shortAddress } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { formatBigInt } from "@/lib/utils";

export default function DistributionPage() {
  const sp = useSearchParams();
  const qc = useQueryClient();
  const defaultSource = sp.get("source") ?? "";
  const selectedIds = sp.get("ids")?.split(",").filter(Boolean) ?? [];
  const [sourceId, setSourceId] = useState(defaultSource);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(selectedIds.map((id) => [id, true]))
  );
  const [preview, setPreview] = useState<DistributionPreview | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [executing, setExecuting] = useState<
    Array<{
      walletId: string;
      amount: bigint;
      status: "pending" | "done" | "error";
      tx?: `0x${string}`;
      error?: string;
    }>
  >([]);
  const [toast, setToast] = useState<string | null>(null);
  const [risk, setRisk] = useState<{ errors: string[]; warnings: string[] }>({
    errors: [],
    warnings: [],
  });

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["wallets-distribution"],
    queryFn: async () => {
      const r = await fetch("/api/wallets?balances=1").then((x) => x.json());
      return r as {
        wallets: Wallet[];
        balances: Record<string, WalletBalance>;
      };
    },
    refetchInterval: 30_000,
  });
  const wallets = data?.wallets ?? [];
  const balances = data?.balances ?? {};
  const byId = useMemo(
    () => Object.fromEntries(wallets.map((w) => [w.id, w])),
    [wallets]
  );
  const source = byId[sourceId];
  const sourceBal = source ? balances[source.id] : undefined;

  useEffect(() => {
    if (!sourceId && wallets[0]) setSourceId(wallets[0].id);
  }, [wallets, sourceId]);

  const recipients = wallets.filter((w) => w.id !== sourceId && w.enabled);

  const onToggleRecipient = (id: string) => {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  };

  const applyEqualDistribution = () => {
    const list = recipients.filter((w) => selected[w.id]);
    if (list.length === 0) return;
    const total = sourceBal?.safeSpendable ?? 0n;
    if (total <= 0n) return;
    const share = total / BigInt(list.length);
    const shareStr = formatUSDC(share, 6);
    const next = { ...amounts };
    list.forEach((w) => (next[w.id] = shareStr));
    setAmounts(next);
  };

  const setAllSelected = (v: boolean) => {
    setSelected(
      Object.fromEntries(recipients.map((w) => [w.id, v]))
    );
  };

  const previewMut = useMutation({
    mutationFn: async () => {
      const items: DistributionItem[] = recipients
        .filter((w) => selected[w.id])
        .map((w) => {
          const raw = (amounts[w.id] ?? "0").trim();
          const amt =
            raw.length > 0 && !isNaN(Number(raw))
              ? parseUSDC(raw)
              : 0n;
          return {
            walletId: w.id,
            address: w.address,
            amount: amt,
          };
        })
        .filter((i) => i.amount > 0n);

      const r = await fetch("/api/distribution/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceWalletId: sourceId, items }),
      });
      const j = (await r.json()) as {
        preview: DistributionPreview;
        risk: { errors: string[]; warnings: string[] };
      };
      if (!r.ok) {
        setToast(j.preview?.errors?.[0] ?? "Preview failed");
        setTimeout(() => setToast(null), 4000);
      }
      return j;
    },
    onSuccess: (j) => {
      setPreview(j.preview);
      setRisk(j.risk ?? { errors: [], warnings: [] });
    },
  });

  const executeMut = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("No preview");
      const r = await fetch("/api/distribution/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceWalletId: preview.sourceWalletId,
          items: preview.items,
        }),
      });
      const j = (await r.json()) as {
        results?: Array<{
          walletId: string;
          amount: string;
          txHash?: string;
          error?: string;
          success: boolean;
        }>;
        error?: string;
      };
      if (!r.ok) throw new Error(j.error ?? "Execute failed");
      return j;
    },
    onSuccess: async (j) => {
      setExecuting(
        (j.results ?? []).map((r) => ({
          walletId: r.walletId,
          amount: BigInt(r.amount),
          status: r.success ? "done" : "error",
          tx: r.txHash as `0x${string}`,
          error: r.error,
        }))
      );
      await qc.invalidateQueries({ queryKey: ["wallets"] });
      void refetch();
    },
    onError: (e) => {
      setToast(e instanceof Error ? e.message : "Execution failed");
      setTimeout(() => setToast(null), 4000);
    },
  });

  const canPreview =
    !!source &&
    recipients.filter((w) => selected[w.id]).some((w) => {
      const raw = (amounts[w.id] ?? "0").trim();
      return raw.length > 0 && !isNaN(Number(raw)) && parseUSDC(raw) > 0n;
    });

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-primary font-bold">
            TREASURY · DISTRIBUTION
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
            Distribute USDC
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Send native USDC from an authorized source wallet to a selected
            group of authorized wallets. All distribution amounts are validated
            against the safe-spendable balance and risk limits.
          </p>
        </div>
        <div className="flex gap-2">
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

      {toast && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
          {toast}
        </div>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Source Wallet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Source</Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {wallets.filter((w) => w.enabled).map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.label} · {shortAddress(w.address)} ·{" "}
                      {formatUSDC(balances[w.id]?.safeSpendable ?? 0n, 0)} USDC
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {source && (
              <div className="grid grid-cols-1 gap-3 text-sm">
                <div className="rounded-md border border-border bg-muted/40 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Wallet</Label>
                    <Badge variant="muted">{source.label}</Badge>
                  </div>
                  <ExplorerLink hash={source.address} type="address" />
                </div>
                <Metric
                  icon={<Coins className="h-3.5 w-3.5" />}
                  label="Balance"
                  value={`${sourceBal ? formatUSDC(sourceBal.nativeUSDC, 2) : "—"} USDC`}
                />
                <Metric
                  icon={<Fuel className="h-3.5 w-3.5" />}
                  label="Gas Reserve"
                  value={`${sourceBal ? formatUSDC(sourceBal.gasReserve, 4) : "—"} USDC`}
                  tone="text-warning"
                />
                <Metric
                  icon={<ArrowDownToLine className="h-3.5 w-3.5" />}
                  label="Safe Spendable"
                  value={`${sourceBal ? formatUSDC(sourceBal.safeSpendable, 2) : "—"} USDC`}
                  tone="text-success"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-primary" />
              Recipient Allocation
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAllSelected(true)}>
                Select All
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAllSelected(false)}>
                Clear
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={applyEqualDistribution}
                disabled={!sourceBal || sourceBal.safeSpendable === 0n}
              >
                Equal Split
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="terminal-th w-10">Sel</th>
                    <th className="terminal-th">Wallet</th>
                    <th className="terminal-th">Address</th>
                    <th className="terminal-th">Current</th>
                    <th className="terminal-th w-40">Amount (USDC)</th>
                    <th className="terminal-th w-40 text-right">After</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((w) => {
                    const bal = balances[w.id]?.nativeUSDC ?? 0n;
                    const amtRaw = (amounts[w.id] ?? "0").trim();
                    const amt =
                      amtRaw.length > 0 && !isNaN(Number(amtRaw))
                        ? parseUSDC(amtRaw)
                        : 0n;
                    return (
                      <tr key={w.id} className="terminal-tr">
                        <td className="terminal-td">
                          <Checkbox
                            checked={!!selected[w.id]}
                            onCheckedChange={() => onToggleRecipient(w.id)}
                          />
                        </td>
                        <td className="terminal-td font-bold tracking-wider">
                          {w.label}
                        </td>
                        <td className="terminal-td font-mono text-xs">
                          <ExplorerLink hash={w.address} type="address" />
                        </td>
                        <td className="terminal-td font-mono">
                          {formatUSDC(bal, 2)}
                        </td>
                        <td className="terminal-td">
                          <Input
                            disabled={!selected[w.id]}
                            className="h-8 font-mono"
                            placeholder="0.00"
                            value={selected[w.id] ? amounts[w.id] ?? "" : ""}
                            onChange={(e) =>
                              setAmounts((a) => ({
                                ...a,
                                [w.id]: e.target.value,
                              }))
                            }
                          />
                        </td>
                        <td className="terminal-td font-mono text-right text-success">
                          {amt > 0n
                            ? `+ ${formatUSDC(bal + amt, 2)}`
                            : formatUSDC(bal, 2)}
                        </td>
                      </tr>
                    );
                  })}
                  {recipients.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="p-10 text-center text-sm text-muted-foreground"
                      >
                        No other enabled wallets available for distribution.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
              <div className="text-xs text-muted-foreground">
                {
                  recipients.filter((w) => selected[w.id]).length
                }{" "}
                of {recipients.length} selected
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => previewMut.mutate()}
                  disabled={!canPreview || previewMut.isPending}
                >
                  {previewMut.isPending ? "Computing…" : "Preview Distribution"}
                </Button>
                <Button
                  variant="success"
                  size="cta"
                  disabled={
                    !preview ||
                    !preview.valid ||
                    risk.errors.length > 0 ||
                    executeMut.isPending
                  }
                  onClick={() => setConfirmOpen(true)}
                >
                  Confirm Distribution
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {(preview || risk.errors.length || risk.warnings.length) && (
        <Card>
          <CardHeader>
            <CardTitle>Distribution Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <RiskWarning errors={risk.errors} warnings={risk.warnings} />
            {preview && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Metric
                    label="Recipients"
                    value={`${preview.items.length}`}
                    icon={<Building2 className="h-4 w-4" />}
                  />
                  <Metric
                    label="Total Distribution"
                    value={`${formatUSDC(preview.total, 2)} USDC`}
                    icon={<Coins className="h-4 w-4" />}
                    tone="text-success"
                  />
                  <Metric
                    label="Estimated Gas"
                    value={`${formatUSDC(preview.estimatedGas, 4)} USDC`}
                    icon={<Fuel className="h-4 w-4" />}
                    tone="text-warning"
                  />
                  <Metric
                    label="Remaining Source Balance"
                    value={`${formatUSDC(preview.remainingAfter, 2)} USDC`}
                    icon={<ArrowRight className="h-4 w-4" />}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <Label>Bot Fee</Label>
                  <span className="font-mono text-success">0.00 USDC</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <Label>Valid</Label>
                  {preview.valid ? (
                    <Badge variant="success">VALID</Badge>
                  ) : (
                    <Badge variant="destructive">INVALID</Badge>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Confirm Distribution</DialogTitle>
            <DialogDescription>
              Review allocation below. Executing submits signed native USDC
              transfers on ARC Mainnet.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2 text-sm">
                <Row
                  label="Source"
                  value={`${source?.label} (${shortAddress(source?.address ?? "0x")})`}
                />
                <Row label="Recipients" value={`${preview.items.length}`} />
                <Row
                  label="Total"
                  value={`${formatUSDC(preview.total, 2)} USDC`}
                  tone="text-success"
                />
                <Row
                  label="Estimated Gas"
                  value={`${formatUSDC(preview.estimatedGas, 4)} USDC`}
                  tone="text-warning"
                />
                <Row label="Bot Fee" value="0.00 USDC" tone="text-success" />
              </div>
              <ul className="space-y-1 max-h-56 overflow-y-auto text-xs font-mono">
                {preview.items.map((i) => {
                  const w = byId[i.walletId];
                  return (
                    <li
                      key={i.walletId}
                      className="flex items-center justify-between py-1 border-b border-border/60 last:border-0"
                    >
                      <span>
                        {w?.label} → {shortAddress(i.address)}
                      </span>
                      <span className="text-success">
                        {formatUSDC(i.amount, 2)} USDC
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="success"
                  size="cta"
                  disabled={
                    !preview.valid ||
                    risk.errors.length > 0 ||
                    executeMut.isPending
                  }
                  onClick={async () => {
                    setConfirmOpen(false);
                    setExecuting(
                      preview.items.map((i) => ({
                        walletId: i.walletId,
                        amount: i.amount,
                        status: "pending",
                      }))
                    );
                    await executeMut.mutateAsync();
                  }}
                >
                  {executeMut.isPending
                    ? "Broadcasting…"
                    : "CONFIRM DISTRIBUTION"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {executing.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Per-Transfer Execution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {executing.map((x) => {
              const w = byId[x.walletId];
              return (
                <div
                  key={x.walletId}
                  className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3"
                >
                  <div className="flex items-center gap-3">
                    {x.status === "done" ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : x.status === "error" ? (
                      <XCircle className="h-4 w-4 text-destructive" />
                    ) : (
                      <RefreshCw className="h-4 w-4 animate-spin text-warning" />
                    )}
                    <div>
                      <div className="text-sm font-bold tracking-wider">
                        {w?.label ?? x.walletId}
                      </div>
                      <div className="text-xs font-mono text-muted-foreground">
                        {formatUSDC(x.amount, 2)} USDC
                      </div>
                    </div>
                  </div>
                  <div>
                    {x.tx ? (
                      <ExplorerLink hash={x.tx} type="tx" />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {x.error ?? "Pending…"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Metric({
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
    <div className="flex items-start justify-between rounded-md border border-border bg-background p-3">
      <div className="space-y-0.5">
        <div className="stat-label">{label}</div>
        <div className={`stat-value text-sm ${tone ?? ""}`}>{value}</div>
      </div>
      {icon && (
        <div className="h-8 w-8 rounded-md border border-border bg-muted/40 flex items-center justify-center text-muted-foreground">
          {icon}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label className="text-[10px]">{label}</Label>
      <div className={`text-sm font-mono text-right ${tone ?? ""}`}>{value}</div>
    </div>
  );
}
