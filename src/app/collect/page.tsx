"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RiskWarning } from "@/components/trading/trade-components";
import { ExplorerLink } from "@/components/ui/explorer-link";
import { WalletStatusBadge } from "@/components/ui/status-badges";
import {
  ArrowUpFromLine,
  Banknote,
  CheckCircle2,
  RefreshCw,
  Vault,
  XCircle,
  Coins,
  Fuel,
} from "lucide-react";
import type {
  CollectPreview,
  DistributionItem,
  Wallet,
  WalletBalance,
} from "@/types";
import { formatUSDC } from "@/lib/blockchain/gas";
import { shortAddress } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

export default function CollectPage() {
  const sp = useSearchParams();
  const qc = useQueryClient();
  const ids = sp.get("ids")?.split(",").filter(Boolean) ?? [];
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(ids.map((id) => [id, true]))
  );
  const [treasuryId, setTreasuryId] = useState<string>("");
  const [preview, setPreview] = useState<CollectPreview | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [risk, setRisk] = useState<{ errors: string[]; warnings: string[] }>({
    errors: [],
    warnings: [],
  });
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

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["wallets-collect"],
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

  useEffect(() => {
    if (!treasuryId && wallets[0]) setTreasuryId(wallets[0].id);
  }, [wallets, treasuryId]);

  const treasury = wallets.find((w) => w.id === treasuryId);
  const treasuryBal = treasury ? balances[treasury.id] : undefined;

  const candidates = wallets.filter((w) => w.id !== treasuryId && w.enabled);

  const setAll = (v: boolean) =>
    setSelected(Object.fromEntries(candidates.map((w) => [w.id, v])));

  const selectedWallets = candidates.filter((w) => selected[w.id]);

  const previewMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/collect/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treasuryWalletId: treasuryId,
          walletIds: selectedWallets.map((w) => w.id),
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setToast(j.preview?.errors?.[0] ?? "Preview failed");
        setTimeout(() => setToast(null), 4000);
      }
      return j as {
        preview: CollectPreview;
        risk: { errors: string[]; warnings: string[] };
      };
    },
    onSuccess: (j) => {
      setPreview(j.preview);
      setRisk(j.risk ?? { errors: [], warnings: [] });
    },
  });

  const execMut = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("Missing preview");
      const r = await fetch("/api/collect/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treasuryWalletId: preview.treasuryWalletId,
          walletIds: preview.items.map((i: DistributionItem) => i.walletId),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Execute failed");
      return j as {
        results: Array<{
          walletId: string;
          amount: string;
          txHash?: string;
          error?: string;
          success: boolean;
        }>;
      };
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
      setToast(e instanceof Error ? e.message : "Execute failed");
      setTimeout(() => setToast(null), 4000);
    },
  });

  const byId = useMemo(
    () => Object.fromEntries(wallets.map((w) => [w.id, w])),
    [wallets]
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-primary font-bold">
            TREASURY · COLLECT
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
            Collect Balances
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Consolidate remaining native USDC from authorized wallets into the
            treasury. Each wallet retains the gas reserve needed to broadcast
            the transfer — balances are never fully drained.
          </p>
        </div>
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
              <Vault className="h-4 w-4 text-primary" />
              Destination Treasury
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold tracking-wider text-sm">
                    {treasury?.label ?? "Select wallet"}
                  </span>
                  {treasury && <WalletStatusBadge status={treasury.status} />}
                </div>
                {treasury && (
                  <ExplorerLink
                    hash={treasury.address}
                    type="address"
                    className="mt-1"
                  />
                )}
              </div>
              <Badge variant="success">TREASURY</Badge>
            </div>
            <MiniMetric
              icon={<Banknote className="h-4 w-4" />}
              label="Current Balance"
              value={
                treasuryBal
                  ? `${formatUSDC(treasuryBal.nativeUSDC, 2)} USDC`
                  : "—"
              }
            />
            <MiniMetric
              icon={<Fuel className="h-4 w-4" />}
              label="Gas Reserve"
              value={
                treasuryBal
                  ? `${formatUSDC(treasuryBal.gasReserve, 4)} USDC`
                  : "—"
              }
              tone="text-warning"
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ArrowUpFromLine className="h-4 w-4 text-primary" />
              Authorized Wallets
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAll(true)}>
                Select All
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAll(false)}>
                Clear
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => previewMut.mutate()}
                disabled={selectedWallets.length === 0 || previewMut.isPending}
              >
                {previewMut.isPending ? "Computing…" : "Preview Collect"}
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
                    <th className="terminal-th text-right">Balance</th>
                    <th className="terminal-th text-right">Gas Reserve</th>
                    <th className="terminal-th text-right">Safe Collectable</th>
                    <th className="terminal-th text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((w) => {
                    const bal = balances[w.id];
                    return (
                      <tr key={w.id} className="terminal-tr">
                        <td className="terminal-td">
                          <Checkbox
                            checked={!!selected[w.id]}
                            onCheckedChange={() =>
                              setSelected((s) => ({
                                ...s,
                                [w.id]: !s[w.id],
                              }))
                            }
                          />
                        </td>
                        <td className="terminal-td font-bold tracking-wider">
                          {w.label}
                        </td>
                        <td className="terminal-td font-mono text-xs">
                          <ExplorerLink hash={w.address} type="address" />
                        </td>
                        <td className="terminal-td font-mono text-right">
                          {bal ? formatUSDC(bal.nativeUSDC, 2) : "—"} USDC
                        </td>
                        <td className="terminal-td font-mono text-right text-warning">
                          {bal ? formatUSDC(bal.gasReserve, 4) : "—"}
                        </td>
                        <td className="terminal-td font-mono text-right text-success font-semibold">
                          {bal ? formatUSDC(bal.safeCollectable, 2) : "—"}
                        </td>
                        <td className="terminal-td text-right">
                          <WalletStatusBadge status={w.status} />
                        </td>
                      </tr>
                    );
                  })}
                  {candidates.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="p-12 text-center text-sm text-muted-foreground"
                      >
                        No additional wallets available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="text-xs text-muted-foreground">
                {selectedWallets.length} of {candidates.length} selected
              </div>
              <Button
                variant="success"
                size="cta"
                disabled={
                  !preview ||
                  !preview.valid ||
                  risk.errors.length > 0 ||
                  execMut.isPending
                }
                onClick={() => setConfirmOpen(true)}
              >
                {preview?.items?.length ?? 0
                  ? `COLLECT ${preview?.items?.length ?? 0} SELECTED`
                  : "COLLECT SELECTED"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {(preview || risk.errors.length || risk.warnings.length) && (
        <Card>
          <CardHeader>
            <CardTitle>Collection Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <RiskWarning errors={risk.errors} warnings={risk.warnings} />
            {preview && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <MiniMetric
                    icon={<Banknote className="h-4 w-4" />}
                    label="Total Balance (selected)"
                    value={`${formatUSDC(preview.totalBalance, 2)} USDC`}
                  />
                  <MiniMetric
                    icon={<Fuel className="h-4 w-4" />}
                    label="Aggregate Gas Reserve"
                    value={`${formatUSDC(preview.totalGasReserve, 4)} USDC`}
                    tone="text-warning"
                  />
                  <MiniMetric
                    icon={<Coins className="h-4 w-4" />}
                    label="Safe Collection"
                    value={`${formatUSDC(preview.safeCollection, 2)} USDC`}
                    tone="text-success"
                  />
                  <MiniMetric
                    icon={<ArrowUpFromLine className="h-4 w-4" />}
                    label="Per Transfer Gas"
                    value={`${formatUSDC(preview.perTransferGas, 4)} USDC`}
                  />
                  <MiniMetric
                    icon={<Vault className="h-4 w-4" />}
                    label="Final Treasury"
                    value={`${formatUSDC(preview.finalTreasuryBalance, 2)} USDC`}
                    tone="text-success"
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Bot Fee
                  </span>
                  <span className="font-mono text-success">0.00 USDC</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Valid
                  </span>
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
            <DialogTitle>Confirm Collection</DialogTitle>
            <DialogDescription>
              Collect safe spendable USDC from each selected wallet into the
              treasury. Each wallet retains its gas reserve for transfer.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2 text-sm">
                <Row
                  label="Treasury"
                  value={`${treasury?.label} · ${shortAddress(treasury?.address ?? "0x")}`}
                />
                <Row
                  label="Wallets"
                  value={`${preview.items.length}`}
                />
                <Row
                  label="Total Balance (selected)"
                  value={`${formatUSDC(preview.totalBalance, 2)} USDC`}
                />
                <Row
                  label="Total Gas Reserve"
                  value={`${formatUSDC(preview.totalGasReserve, 4)} USDC`}
                  tone="text-warning"
                />
                <Row
                  label="Safe Collection"
                  value={`${formatUSDC(preview.safeCollection, 2)} USDC`}
                  tone="text-success"
                />
                <Row
                  label="Estimated Gas"
                  value={`${formatUSDC(preview.estimatedGas, 4)} USDC`}
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
                        {w?.label} → TREASURY ({shortAddress(i.address)})
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
                    execMut.isPending
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
                    await execMut.mutateAsync();
                  }}
                >
                  {execMut.isPending ? "Broadcasting…" : "CONFIRM COLLECT"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {executing.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Per-Wallet Collection</CardTitle>
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
                        {formatUSDC(x.amount, 2)} USDC → Treasury
                      </div>
                    </div>
                  </div>
                  {x.tx ? (
                    <ExplorerLink hash={x.tx} type="tx" />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {x.error ?? "Pending…"}
                    </span>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MiniMetric({
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
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className={`text-sm font-mono text-right ${tone ?? ""}`}>{value}</span>
    </div>
  );
}
