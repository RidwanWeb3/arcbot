"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  WalletGrid,
  WalletTableRow,
} from "@/components/wallets/wallet-components";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, Plus, Upload, RefreshCw, LayoutGrid, List, Search } from "lucide-react";
import type { Wallet as WalletT, WalletBalance } from "@/types";
import { shortAddress } from "@/lib/utils";
import { ExplorerLink } from "@/components/ui/explorer-link";
import { formatUSDC } from "@/lib/blockchain/gas";

export default function WalletsPage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"grid" | "table">("grid");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState<WalletT | null>(null);
  const [viewOpen, setViewOpen] = useState<WalletT | null>(null);
  const [confirmEnable, setConfirmEnable] = useState<{
    w: WalletT;
    enable: boolean;
  } | null>(null);
  const [formLabel, setFormLabel] = useState("");
  const [importLabel, setImportLabel] = useState("");
  const [importPK, setImportPK] = useState("");
  const [importConfirm, setImportConfirm] = useState(false);
  const [renameLabel, setRenameLabel] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["wallets-full-page"],
    queryFn: async () => {
      const r = await fetch("/api/wallets?balances=1").then((x) => x.json());
      return r as {
        wallets: WalletT[];
        balances: Record<string, WalletBalance>;
      };
    },
    refetchInterval: 25_000,
  });

  const wallets = data?.wallets ?? [];
  const balances = data?.balances ?? {};
  const filtered = wallets.filter(
    (w) =>
      !search ||
      w.label.toLowerCase().includes(search.toLowerCase()) ||
      w.address.toLowerCase().includes(search.toLowerCase())
  );

  const createMut = useMutation({
    mutationFn: async (label: string) => {
      const r = await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", label }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
      return j;
    },
    onSuccess: () => {
      setCreateOpen(false);
      setFormLabel("");
      setToast("Wallet created");
      setTimeout(() => setToast(null), 2500);
      void qc.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (e) => setToast(e instanceof Error ? e.message : "Error"),
  });

  const importMut = useMutation({
    mutationFn: async (payload: { label: string; pk: string }) => {
      const r = await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import",
          label: payload.label,
          privateKey: payload.pk,
          confirm: true,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
      return j;
    },
    onSuccess: () => {
      setImportOpen(false);
      setImportLabel("");
      setImportPK("");
      setImportConfirm(false);
      setToast("Wallet imported & encrypted");
      setTimeout(() => setToast(null), 3000);
      void qc.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (e) => setToast(e instanceof Error ? e.message : "Error"),
  });

  const renameMut = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const r = await fetch(`/api/wallets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", label }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
      return j;
    },
    onSuccess: () => {
      setRenameOpen(null);
      setRenameLabel("");
      setToast("Wallet renamed");
      setTimeout(() => setToast(null), 2000);
      void qc.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (e) => setToast(e instanceof Error ? e.message : "Error"),
  });

  const toggleMut = useMutation({
    mutationFn: async ({
      id,
      enabled,
    }: {
      id: string;
      enabled: boolean;
    }) => {
      const r = await fetch(`/api/wallets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
      return j;
    },
    onSuccess: () => {
      setConfirmEnable(null);
      void qc.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (e) => setToast(e instanceof Error ? e.message : "Error"),
  });

  const onAction = (action: string, w: WalletT) => {
    switch (action) {
      case "view":
        setViewOpen(w);
        break;
      case "rename":
        setRenameOpen(w);
        setRenameLabel(w.label);
        break;
      case "enable":
      case "disable":
        setConfirmEnable({ w, enable: action === "enable" });
        break;
      case "trade":
        window.location.href = `/trading?walletId=${w.id}`;
        break;
      case "transfer":
        window.location.href = `/distribution?source=${w.id}`;
        break;
      case "collect":
        window.location.href = `/collect?ids=${w.id}`;
        break;
      default:
        break;
    }
  };

  const viewW = viewOpen;
  const viewBal = viewW ? balances[viewW.id] : undefined;

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-primary font-bold">
            WALLET MANAGEMENT
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
            Wallet Pool
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Authorized EVM wallets for ARC Mainnet operations. Native USDC is
            gas; all balances use safe-spend accounting.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8 w-56"
              placeholder="Search wallet…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="inline-flex rounded-md border border-border p-0.5 bg-muted">
            <Button
              size="sm"
              variant={mode === "grid" ? "default" : "ghost"}
              onClick={() => setMode("grid")}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant={mode === "table" ? "default" : "ghost"}
              onClick={() => setMode("table")}
              aria-label="Table view"
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button
            size="cta"
            variant="outline"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            size="cta"
            variant="outline"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="h-3.5 w-3.5" />
            Import
          </Button>
          <Button size="cta" variant="success" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Create Wallet
          </Button>
        </div>
      </header>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] bg-card border border-border rounded-md px-4 py-2 shadow-lg text-sm animate-slide-up">
          {toast}
        </div>
      )}

      <Tabs defaultValue="all">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="all">All ({filtered.length})</TabsTrigger>
            <TabsTrigger value="ready">
              Ready (
              {filtered.filter((w) => w.status === "READY").length})
            </TabsTrigger>
            <TabsTrigger value="low">
              Low ({filtered.filter(
                (w) => w.status === "LOW_BALANCE" || w.status === "LOW_GAS"
              ).length})
            </TabsTrigger>
            <TabsTrigger value="disabled">
              Disabled (
              {filtered.filter((w) => w.status === "DISABLED").length})
            </TabsTrigger>
          </TabsList>
          <Badge variant="muted">Native USDC as gas · Chain 5042</Badge>
        </div>

        <TabsContent value="all" className="mt-5">
          {mode === "grid" ? (
            <WalletGrid
              wallets={filtered}
              balances={balances}
              onAction={onAction}
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30">
                  <tr>
                    <th className="terminal-th">Wallet</th>
                    <th className="terminal-th">Address</th>
                    <th className="terminal-th">Native USDC</th>
                    <th className="terminal-th">Gas Reserve</th>
                    <th className="terminal-th">Safe Spendable</th>
                    <th className="terminal-th">Status</th>
                    <th className="terminal-th">Last Activity</th>
                    <th className="terminal-th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((w) => (
                    <WalletTableRow
                      key={w.id}
                      wallet={w}
                      balance={balances[w.id]}
                      onAction={onAction}
                    />
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="p-12 text-center text-muted-foreground text-sm"
                      >
                        <Wallet className="h-10 w-10 mx-auto mb-3 opacity-40" />
                        No authorized wallets match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="ready" className="mt-5">
          {mode === "grid" ? (
            <WalletGrid
              wallets={filtered.filter((w) => w.status === "READY")}
              balances={balances}
              onAction={onAction}
            />
          ) : (
            <WalletTableList
              filtered={filtered.filter((w) => w.status === "READY")}
              balances={balances}
              onAction={onAction}
            />
          )}
        </TabsContent>
        <TabsContent value="low" className="mt-5">
          {mode === "grid" ? (
            <WalletGrid
              wallets={filtered.filter(
                (w) => w.status === "LOW_BALANCE" || w.status === "LOW_GAS"
              )}
              balances={balances}
              onAction={onAction}
            />
          ) : (
            <WalletTableList
              filtered={filtered.filter(
                (w) => w.status === "LOW_BALANCE" || w.status === "LOW_GAS"
              )}
              balances={balances}
              onAction={onAction}
            />
          )}
        </TabsContent>
        <TabsContent value="disabled" className="mt-5">
          {mode === "grid" ? (
            <WalletGrid
              wallets={filtered.filter((w) => w.status === "DISABLED")}
              balances={balances}
              onAction={onAction}
            />
          ) : (
            <WalletTableList
              filtered={filtered.filter((w) => w.status === "DISABLED")}
              balances={balances}
              onAction={onAction}
            />
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Authorized Wallet</DialogTitle>
            <DialogDescription>
              Generate a secure EVM keypair for ARC Mainnet. Private key is
              encrypted at rest using the server-side WALLET_ENCRYPTION_KEY.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="lbl">Wallet Label</Label>
            <Input
              id="lbl"
              placeholder="e.g. W11 or Treasury-2"
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="success"
              size="cta"
              disabled={!formLabel || createMut.isPending}
              onClick={() => createMut.mutate(formLabel.trim())}
            >
              {createMut.isPending ? "Generating…" : "Generate Wallet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Import Authorized Wallet</DialogTitle>
            <DialogDescription>
              Private key is encrypted immediately with the server-side
              WALLET_ENCRYPTION_KEY. Plaintext keys are never logged or stored.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="ilbl">Label</Label>
              <Input
                id="ilbl"
                placeholder="W-IMPORT-1"
                value={importLabel}
                onChange={(e) => setImportLabel(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ipk">Private Key (0x + 64 hex)</Label>
              <Input
                id="ipk"
                type="password"
                placeholder="0x… (64 hex chars)"
                value={importPK}
                onChange={(e) => setImportPK(e.target.value.trim())}
              />
            </div>
            <label className="flex items-start gap-2 text-xs text-muted-foreground select-none">
              <input
                type="checkbox"
                checked={importConfirm}
                onChange={(e) => setImportConfirm(e.target.checked)}
                className="mt-0.5 accent-primary"
              />
              <span>
                I confirm that this wallet is explicitly authorized for ARC
                trading operations and I accept responsibility for the funds.
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="success"
              size="cta"
              disabled={
                !importLabel ||
                !/^0x[0-9a-fA-F]{64}$/.test(importPK) ||
                !importConfirm ||
                importMut.isPending
              }
              onClick={() => importMut.mutate({ label: importLabel.trim(), pk: importPK })}
            >
              {importMut.isPending ? "Encrypting…" : "Import & Encrypt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!renameOpen}
        onOpenChange={(o) => !o && setRenameOpen(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Wallet</DialogTitle>
            <DialogDescription>
              {renameOpen
                ? `Currently: ${renameOpen.label} · ${shortAddress(renameOpen.address)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rn">New Label</Label>
            <Input
              id="rn"
              value={renameLabel}
              onChange={(e) => setRenameLabel(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(null)}>
              Cancel
            </Button>
            <Button
              variant="success"
              size="cta"
              disabled={!renameLabel || !renameOpen || renameMut.isPending}
              onClick={() =>
                renameOpen &&
                renameMut.mutate({ id: renameOpen.id, label: renameLabel.trim() })
              }
            >
              {renameMut.isPending ? "Saving…" : "Save Label"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewW} onOpenChange={(o) => !o && setViewOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewW?.label ?? "Wallet"}</DialogTitle>
            <DialogDescription>
              #{String(viewW?.index ?? 0).padStart(2, "0")} ·{" "}
              {viewW?.status}
            </DialogDescription>
          </DialogHeader>
          {viewW && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-col gap-1">
                <Label>Address</Label>
                <ExplorerLink hash={viewW.address} type="address" />
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div>
                  <div className="stat-label">Native USDC</div>
                  <div className="stat-value text-sm">
                    {viewBal ? formatUSDC(viewBal.nativeUSDC, 2) : "—"}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Gas Reserve</div>
                  <div className="stat-value text-sm text-warning">
                    {viewBal ? formatUSDC(viewBal.gasReserve, 4) : "—"}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Safe Spendable</div>
                  <div className="stat-value text-sm text-success">
                    {viewBal ? formatUSDC(viewBal.safeSpendable, 2) : "—"}
                  </div>
                </div>
              </div>
              <Card>
                <CardContent className="p-3 text-xs text-muted-foreground space-y-1">
                  <div>
                    <span className="stat-label">Created</span>{" "}
                    {new Date(viewW.createdAt).toLocaleString()}
                  </div>
                  <div>
                    <span className="stat-label">Last Activity</span>{" "}
                    {viewW.lastActivityAt
                      ? new Date(viewW.lastActivityAt).toLocaleString()
                      : "—"}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewOpen(null)}>
              Close
            </Button>
            <Button
              asChild
              variant="success"
              size="cta"
              onClick={() => setViewOpen(null)}
            >
              <a href={`/trading?walletId=${viewW?.id}`}>Trade from Wallet</a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmEnable}
        onOpenChange={(o) => !o && setConfirmEnable(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmEnable?.enable ? "Enable wallet?" : "Disable wallet?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmEnable?.enable
                ? "Enabling this wallet will permit distributions, collections, and trades from its USDC balance."
                : "Disabling this wallet will prevent new operations from being created. Existing pending transactions will continue to monitor."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                confirmEnable &&
                toggleMut.mutate({
                  id: confirmEnable.w.id,
                  enabled: confirmEnable.enable,
                })
              }
            >
              {confirmEnable?.enable ? "ENABLE" : "DISABLE"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function WalletTableList({
  filtered,
  balances,
  onAction,
}: {
  filtered: WalletT[];
  balances: Record<string, WalletBalance>;
  onAction: (a: string, w: WalletT) => void;
}) {
  if (filtered.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          No wallets in this segment.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/30">
          <tr>
            <th className="terminal-th">Wallet</th>
            <th className="terminal-th">Address</th>
            <th className="terminal-th">Native USDC</th>
            <th className="terminal-th">Gas Reserve</th>
            <th className="terminal-th">Safe Spendable</th>
            <th className="terminal-th">Status</th>
            <th className="terminal-th">Last Activity</th>
            <th className="terminal-th">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((w) => (
            <WalletTableRow
              key={w.id}
              wallet={w}
              balance={balances[w.id]}
              onAction={onAction}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
