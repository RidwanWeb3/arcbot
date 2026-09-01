"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RiskWarning } from "@/components/trading/trade-components";
import { ExplorerLink } from "@/components/ui/explorer-link";
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  CheckCircle2,
  Coins,
  Fuel,
  RefreshCw,
  ShieldCheck,
  XCircle,
  Zap,
} from "lucide-react";
import type {
  BulkTradePreview,
  BulkTradeResult,
  TokenInfo,
  Wallet,
  WalletBalance,
} from "@/types";
import { formatUSDC, parseUSDC } from "@/lib/blockchain/gas";
import { formatBigInt, shortAddress } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

type Direction = "BUY" | "SELL";

export default function MassTradingPage() {
  const sp = useSearchParams();
  const qc = useQueryClient();
  const defaultToken = sp.get("token") ?? "";
  const defaultDir = (sp.get("dir") === "SELL" ? "SELL" : "BUY") as Direction;

  const [direction, setDirection] = useState<Direction>(defaultDir);
  const [tokenAddr, setTokenAddr] = useState(defaultToken);
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [uniformAmount, setUniformAmount] = useState("");
  const [slippage, setSlippage] = useState(100);
  const [preview, setPreview] = useState<BulkTradePreview | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [executing, setExecuting] = useState<
    Array<{
      walletId: string;
      status: "pending" | "done" | "error";
      tx?: `0x${string}`;
      error?: string;
      amount?: string;
    }>
  >([]);
  const [toast, setToast] = useState<string | null>(null);
  const [tokenRisk, setTokenRisk] = useState<{
    errors: string[];
    warnings: string[];
  }>({ errors: [], warnings: [] });

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["wallets-mass-trading"],
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
  const enabledWallets = wallets.filter((w) => w.enabled);

  useEffect(() => {
    const sel: Record<string, boolean> = {};
    enabledWallets.forEach((w) => (sel[w.id] = true));
    setSelected(sel);
  }, [enabledWallets.length]);

  useEffect(() => {
    if (tokenAddr) void validateTokenMut.mutateAsync(tokenAddr);
  }, [tokenAddr]);

  const validateTokenMut = useMutation({
    mutationFn: async (addr: string) => {
      const r = await fetch("/api/token/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addr }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Validation failed");
      return j as { token: TokenInfo };
    },
    onSuccess: (j) => {
      setToken(j.token);
      setPreview(null);
      setTokenRisk({
        errors: j.token.error ? [j.token.error] : [],
        warnings: [],
      });
    },
    onError: (e) => {
      setToken(null);
      setPreview(null);
      setTokenRisk({
        errors: [e instanceof Error ? e.message : "Invalid token"],
        warnings: [],
      });
    },
  });

  const { data: tokenBalances, refetch: refetchTokenBalances } = useQuery({
    queryKey: [
      "mass-trading-token-balances",
      direction,
      token?.address,
      enabledWallets.map((w) => w.id).join("|"),
    ],
    enabled: direction === "SELL" && !!token && enabledWallets.length > 0,
    queryFn: async () => {
      if (!token) return {} as Record<string, string>;
      const result: Record<string, string> = {};
      await Promise.all(
        enabledWallets.map(async (w) => {
          try {
            const r = await fetch(
              `/api/wallets/${w.id}/balance?token=${token.address}`
            );
            if (r.ok) {
              const j = await r.json();
              if (j.tokenBalance !== undefined) {
                result[w.id] = String(j.tokenBalance);
              }
            }
          } catch {
            // ignore
          }
        })
      );
      return result;
    },
    refetchInterval: 15_000,
  });

  const previewMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Validate a token first");
      const r = await fetch("/api/trading/bulk/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          tokenAddress: token.address,
          slippageBps: slippage,
          walletIds: enabledWallets
            .filter((w) => selected[w.id])
            .map((w) => w.id),
          amounts,
          sellAll: direction === "SELL" && uniformAmount === "__ALL__",
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Preview failed");
      return j as { preview: BulkTradePreview; token: TokenInfo };
    },
    onSuccess: (j) => {
      setPreview(j.preview);
    },
    onError: (e) => {
      setToast(e instanceof Error ? e.message : "Preview failed");
      setTimeout(() => setToast(null), 4000);
    },
  });

  const executeMut = useMutation({
    mutationFn: async () => {
      if (!preview || !token) throw new Error("No preview");
      const validItems = preview.items
        .filter((i) => !i.error && i.amount > 0n && i.quote)
        .map((i) => ({ walletId: i.walletId, amount: i.amount.toString() }));
      if (validItems.length === 0) throw new Error("No valid items");
      const r = await fetch("/api/trading/bulk/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          tokenAddress: token.address,
          slippageBps: preview.slippageBps,
          items: validItems,
          confirm: true,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Execute failed");
      return j as {
        results: BulkTradeResult[];
        successCount: number;
        totalCount: number;
      };
    },
    onSuccess: async (j) => {
      setExecuting(
        j.results.map((r) => ({
          walletId: r.walletId,
          amount: r.amount,
          status: r.success ? "done" : "error",
          tx: r.txHash as `0x${string}` | undefined,
          error: r.error,
        }))
      );
      await qc.invalidateQueries({ queryKey: ["wallets"] });
      await qc.invalidateQueries({ queryKey: ["transactions"] });
      void refetch();
    },
    onError: (e) => {
      setToast(e instanceof Error ? e.message : "Execution failed");
      setTimeout(() => setToast(null), 5000);
    },
  });

  const toggleWallet = (id: string) => {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  };

  const setAllSelected = (v: boolean) => {
    setSelected(
      Object.fromEntries(enabledWallets.map((w) => [w.id, v]))
    );
  };

  const applyUniform = () => {
    const next: Record<string, string> = {};
    enabledWallets
      .filter((w) => selected[w.id])
      .forEach((w) => (next[w.id] = uniformAmount));
    setAmounts(next);
  };

  const applySafeBuy = () => {
    const next: Record<string, string> = {};
    enabledWallets
      .filter((w) => selected[w.id])
      .forEach((w) => {
        const safe = balances[w.id]?.safeSpendable ?? 0n;
        next[w.id] = formatUSDC(safe, 6);
      });
    setAmounts(next);
    setUniformAmount("");
  };

  const setSellAll = () => {
    setUniformAmount("__ALL__");
    const next: Record<string, string> = {};
    setAmounts(next);
  };

  const hasValidAmounts = enabledWallets
    .filter((w) => selected[w.id])
    .some((w) => {
      if (direction === "SELL" && uniformAmount === "__ALL__") return true;
      const raw = (amounts[w.id] ?? "0").trim();
      return raw.length > 0 && !isNaN(Number(raw)) && Number(raw) > 0;
    });

  const canPreview =
    !!token &&
    !!(token as TokenInfo).verified !== false &&
    hasValidAmounts &&
    tokenRisk.errors.length === 0 &&
    enabledWallets.filter((w) => selected[w.id]).length > 0;

  const riskWarnings: string[] = [];
  const riskErrors: string[] = [...tokenRisk.errors];
  if (token) {
    if (!token.hasRoute)
      riskWarnings.push("No verified DEX route — execution may fail.");
    if (!token.verified) riskWarnings.push("Token unverified.");
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-primary font-bold">
            TRADING · MASS EXECUTION
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
            Mass Buy / Sell All
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Execute BUY with a fixed or per-wallet USDC amount across all
            enabled wallets, or SELL ALL token positions from every wallet in
            one batch. Risk checks apply per-wallet.
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
            Refresh Balances
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
              <ArrowRightLeft className="h-4 w-4 text-primary" />
              Trade Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Mode</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <Button
                  type="button"
                  variant={direction === "BUY" ? "default" : "outline"}
                  onClick={() => {
                    setDirection("BUY");
                    setUniformAmount("");
                    setPreview(null);
                  }}
                  size="sm"
                >
                  <ArrowDownToLine className="h-3.5 w-3.5 mr-1" /> BUY
                </Button>
                <Button
                  type="button"
                  variant={direction === "SELL" ? "default" : "outline"}
                  onClick={() => {
                    setDirection("SELL");
                    setPreview(null);
                  }}
                  size="sm"
                >
                  <ArrowUpFromLine className="h-3.5 w-3.5 mr-1" /> SELL
                </Button>
              </div>
            </div>

            <div>
              <Label>Token Address (ARC)</Label>
              <Input
                className="mt-1 font-mono text-xs"
                placeholder="0x… (40 hex chars)"
                value={tokenAddr}
                onChange={(e) => {
                  setTokenAddr(e.target.value.trim());
                  setPreview(null);
                }}
              />
            </div>

            {token && (
              <div className="rounded-md border border-border bg-muted/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold tracking-wider">
                      {token.symbol}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {token.name}
                    </div>
                  </div>
                  <Badge
                    variant={token.verified ? "success" : "muted"}
                    className="text-[9px]"
                  >
                    {token.verified ? "VERIFIED" : "UNVERIFIED"}
                  </Badge>
                </div>
                <ExplorerLink hash={token.address} type="address" />
                <Separator />
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <MetricMini
                    label="Decimals"
                    value={String(token.decimals)}
                  />
                  <MetricMini
                    label="Liquidity"
                    value={
                      token.liquidityUSDC !== undefined
                        ? formatUSDC(BigInt(token.liquidityUSDC.toString()), 2) +
                          " USDC"
                        : "—"
                    }
                  />
                </div>
              </div>
            )}

            <div>
              <Label>Slippage ({(slippage / 100).toFixed(2)}%)</Label>
              <input
                type="range"
                min={1}
                max={5000}
                step={1}
                value={slippage}
                onChange={(e) => setSlippage(Number(e.target.value))}
                className="w-full mt-2 accent-primary"
              />
              <div className="flex justify-between text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                <span>0.01%</span>
                <span>50%</span>
              </div>
            </div>

            {direction === "BUY" ? (
              <>
                <div>
                  <Label>Uniform BUY Amount per Wallet (USDC)</Label>
                  <Input
                    className="mt-1 font-mono"
                    placeholder="e.g. 250.00"
                    value={uniformAmount === "__ALL__" ? "" : uniformAmount}
                    onChange={(e) => setUniformAmount(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={applyUniform}
                    disabled={uniformAmount === "__ALL__" || !uniformAmount}
                  >
                    Apply to All
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={applySafeBuy}
                  >
                    <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Max Safe
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label>SELL Mode</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <Button
                      size="sm"
                      variant={
                        uniformAmount !== "__ALL__" ? "default" : "outline"
                      }
                      onClick={() => setUniformAmount("")}
                    >
                      Custom per Wallet
                    </Button>
                    <Button
                      size="sm"
                      variant={
                        uniformAmount === "__ALL__" ? "default" : "outline"
                      }
                      onClick={setSellAll}
                    >
                      <Zap className="h-3.5 w-3.5 mr-1" /> SELL ALL 100%
                    </Button>
                  </div>
                </div>
                {uniformAmount !== "__ALL__" && (
                  <>
                    <div>
                      <Label>Uniform Amount per Wallet ({token?.symbol ?? "tokens"})</Label>
                      <Input
                        className="mt-1 font-mono"
                        placeholder="e.g. 1250.00"
                        value={uniformAmount}
                        onChange={(e) => setUniformAmount(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={applyUniform}
                        disabled={!uniformAmount}
                      >
                        Apply to All
                      </Button>
                    </div>
                  </>
                )}
                {uniformAmount === "__ALL__" && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive font-bold tracking-widest">
                    ⚠ SELL ALL — Will liquidate 100% of token balance from each
                    selected wallet.
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-primary" />
              Wallet Allocation ({direction})
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAllSelected(true)}>
                Select All
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAllSelected(false)}>
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="terminal-th w-10">#</th>
                    <th className="terminal-th w-10">Sel</th>
                    <th className="terminal-th">Wallet</th>
                    <th className="terminal-th">
                      {direction === "BUY" ? "Safe Spendable" : "Token Balance"}
                    </th>
                    <th className="terminal-th w-48">
                      {direction === "BUY" ? "Amount (USDC)" : `Amount (${token?.symbol ?? "tokens"})`}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {enabledWallets.map((w, idx) => {
                    const bal = balances[w.id];
                    const isSelected = !!selected[w.id];
                    let inputValue = "";
                    if (direction === "SELL" && uniformAmount === "__ALL__") {
                      inputValue = "ALL";
                    } else if (
                      uniformAmount &&
                      uniformAmount !== "__ALL__"
                    ) {
                      inputValue = uniformAmount;
                    } else {
                      inputValue = amounts[w.id] ?? "";
                    }
                    const disabled =
                      !isSelected ||
                      (direction === "SELL" && uniformAmount === "__ALL__");

                    const displayBal =
                      direction === "BUY"
                        ? `${formatUSDC(bal?.safeSpendable ?? 0n, 2)} USDC`
                        : token
                          ? `${formatBigInt(0n, token.decimals, 4)} ${token.symbol} (offline)`
                          : "—";

                    return (
                      <tr key={w.id} className="terminal-tr">
                        <td className="terminal-td text-muted-foreground font-mono text-xs">
                          {String(idx + 1).padStart(2, "0")}
                        </td>
                        <td className="terminal-td">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleWallet(w.id)}
                          />
                        </td>
                        <td className="terminal-td font-bold tracking-wider">
                          <div>{w.label}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            <ExplorerLink hash={w.address} type="address" />
                          </div>
                        </td>
                        <td className="terminal-td font-mono">
                          <div
                            className={
                              direction === "BUY" &&
                              bal &&
                              bal.safeSpendable > 0n
                                ? "text-success"
                                : ""
                            }
                          >
                            {direction === "BUY"
                              ? displayBal
                              : tokenBalColumn(balances, w.id, token, tokenBalances)}
                          </div>
                        </td>
                        <td className="terminal-td">
                          <Input
                            disabled={disabled}
                            className="h-8 font-mono"
                            placeholder={direction === "BUY" ? "0.00" : "0.000000"}
                            value={isSelected ? inputValue : ""}
                            onChange={(e) =>
                              setAmounts((a) => ({
                                ...a,
                                [w.id]: e.target.value,
                              }))
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {enabledWallets.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-10 text-center text-sm text-muted-foreground"
                      >
                        No enabled wallets. Create or enable wallets first.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
              <div className="text-xs text-muted-foreground">
                {
                  enabledWallets.filter((w) => selected[w.id]).length
                }{" "}
                of {enabledWallets.length} selected · {direction}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => previewMut.mutate()}
                  disabled={!canPreview || previewMut.isPending}
                >
                  {previewMut.isPending ? "Computing…" : "Preview Batch"}
                </Button>
                <Button
                  variant="success"
                  size="cta"
                  disabled={
                    !preview ||
                    preview.validItems === 0 ||
                    riskErrors.length > 0 ||
                    executeMut.isPending ||
                    executing.length > 0
                  }
                  onClick={() => setConfirmOpen(true)}
                >
                  <Zap className="h-3.5 w-3.5 mr-1" /> EXECUTE BATCH
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {(preview || riskErrors.length || riskWarnings.length) && (
        <Card>
          <CardHeader>
            <CardTitle>Batch Preview · {preview?.tokenSymbol ?? token?.symbol}</CardTitle>
            <CardDescription>
              Quotes aggregated per wallet. Invalid rows are skipped during
              execution.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RiskWarning errors={riskErrors} warnings={riskWarnings} />
            {preview && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricBox
                    icon={<Coins className="h-4 w-4" />}
                    label="Wallets Ready"
                    value={`${preview.validItems} / ${preview.totalItems}`}
                  />
                  <MetricBox
                    icon={<ArrowDownToLine className="h-4 w-4" />}
                    label={`Total Input (${preview.totalInputSymbol})`}
                    value={
                      preview.direction === "BUY"
                        ? formatUSDC(BigInt(String(preview.totalInput)), 2)
                        : formatBigInt(
                            BigInt(String(preview.totalInput)),
                            preview.tokenDecimals,
                            4
                          )
                    }
                    tone="text-success"
                  />
                  <MetricBox
                    icon={<ArrowUpFromLine className="h-4 w-4" />}
                    label={`Expected Output (${preview.totalExpectedOutputSymbol})`}
                    value={
                      preview.direction === "BUY"
                        ? formatBigInt(
                            BigInt(String(preview.totalExpectedOutput)),
                            preview.tokenDecimals,
                            4
                          )
                        : formatUSDC(
                            BigInt(String(preview.totalExpectedOutput)),
                            2
                          )
                    }
                    tone="text-primary"
                  />
                  <MetricBox
                    icon={<Fuel className="h-4 w-4" />}
                    label="Estimated Gas"
                    value={formatUSDC(BigInt(String(preview.totalEstimatedGas)), 4) + " USDC"}
                    tone="text-warning"
                  />
                </div>

                <Separator />

                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="terminal-th">Wallet</th>
                        <th className="terminal-th">Input</th>
                        <th className="terminal-th">Expected Out</th>
                        <th className="terminal-th">Gas</th>
                        <th className="terminal-th">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.items.map((i) => {
                        const w = byId[i.walletId];
                        return (
                          <tr key={i.walletId} className="terminal-tr">
                            <td className="terminal-td font-bold tracking-wider">
                              {w?.label ?? i.walletId}
                            </td>
                            <td className="terminal-td font-mono">
                              {preview.direction === "BUY"
                                ? formatUSDC(BigInt(String(i.amount)), 2) +
                                  " USDC"
                                : formatBigInt(
                                    BigInt(String(i.amount)),
                                    preview.tokenDecimals,
                                    4
                                  ) +
                                  " " +
                                  preview.tokenSymbol}
                            </td>
                            <td className="terminal-td font-mono text-success">
                              {i.quote
                                ? preview.direction === "BUY"
                                  ? formatBigInt(
                                      BigInt(
                                        String(
                                          (i.quote as unknown as { expectedOutput: bigint })
                                            .expectedOutput
                                        )
                                      ),
                                      preview.tokenDecimals,
                                      4
                                    ) +
                                    " " +
                                    preview.tokenSymbol
                                  : formatUSDC(
                                      BigInt(
                                        String(
                                          (i.quote as unknown as { expectedOutput: bigint })
                                            .expectedOutput
                                        )
                                      ),
                                      2
                                    ) + " USDC"
                                : "—"}
                            </td>
                            <td className="terminal-td font-mono text-warning">
                              {i.quote
                                ? formatUSDC(
                                    BigInt(
                                      String(
                                        (i.quote as unknown as { estimatedGas: bigint })
                                          .estimatedGas
                                      )
                                    ),
                                    4
                                  )
                                : "—"}
                            </td>
                            <td className="terminal-td">
                              {i.error ? (
                                <Badge variant="destructive" className="text-[9px]">
                                  {i.error.length > 36
                                    ? i.error.slice(0, 36) + "…"
                                    : i.error}
                                </Badge>
                              ) : (
                                <Badge variant="success" className="text-[9px]">
                                  READY
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <Label>DEX Fee</Label>
                  <span className="font-mono text-warning">
                    {formatUSDC(BigInt(String(preview.totalDexFee)), 6)} USDC
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <Label>Bot Fee</Label>
                  <span className="font-mono text-success">0.00 USDC</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <Label>Executable</Label>
                  {preview.validItems > 0 ? (
                    <Badge variant="success">{preview.validItems} trades</Badge>
                  ) : (
                    <Badge variant="destructive">0 valid trades</Badge>
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
            <DialogTitle>Confirm Batch {direction}</DialogTitle>
            <DialogDescription>
              Review the aggregated preview. Execution will iterate each
              selected wallet sequentially on ARC Mainnet.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2 text-sm">
                <Row
                  label="Token"
                  value={`${preview.tokenSymbol} · ${shortAddress(preview.tokenAddress)}`}
                />
                <Row
                  label="Wallets"
                  value={`${preview.validItems} / ${preview.totalItems} ready`}
                />
                <Row
                  label={`Total Input (${preview.totalInputSymbol})`}
                  value={
                    preview.direction === "BUY"
                      ? formatUSDC(BigInt(String(preview.totalInput)), 2)
                      : formatBigInt(
                          BigInt(String(preview.totalInput)),
                          preview.tokenDecimals,
                          4
                        )
                  }
                  tone="text-success"
                />
                <Row
                  label={`Expected Out (${preview.totalExpectedOutputSymbol})`}
                  value={
                    preview.direction === "BUY"
                      ? formatBigInt(
                          BigInt(String(preview.totalExpectedOutput)),
                          preview.tokenDecimals,
                          4
                        )
                      : formatUSDC(
                          BigInt(String(preview.totalExpectedOutput)),
                          2
                        )
                  }
                  tone="text-primary"
                />
                <Row
                  label="Estimated Gas"
                  value={formatUSDC(BigInt(String(preview.totalEstimatedGas)), 4) + " USDC"}
                  tone="text-warning"
                />
                <Row label="Bot Fee" value="0.00 USDC" tone="text-success" />
              </div>
              <ul className="space-y-1 max-h-56 overflow-y-auto text-xs font-mono">
                {preview.items
                  .filter((i) => !i.error && i.amount > 0n)
                  .map((i) => {
                    const w = byId[i.walletId];
                    return (
                      <li
                        key={i.walletId}
                        className="flex items-center justify-between py-1 border-b border-border/60 last:border-0"
                      >
                        <span>{w?.label ?? i.walletId}</span>
                        <span className="text-success">
                          {preview.direction === "BUY"
                            ? formatUSDC(BigInt(String(i.amount)), 2) +
                              " USDC"
                            : formatBigInt(
                                BigInt(String(i.amount)),
                                preview.tokenDecimals,
                                4
                              ) +
                              " " +
                              preview.tokenSymbol}
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
                    preview.validItems === 0 ||
                    riskErrors.length > 0 ||
                    executeMut.isPending
                  }
                  onClick={async () => {
                    setConfirmOpen(false);
                    const items = preview.items.filter(
                      (i) => !i.error && i.amount > 0n
                    );
                    setExecuting(
                      items.map((i) => ({
                        walletId: i.walletId,
                        amount:
                          preview.direction === "BUY"
                            ? formatUSDC(BigInt(String(i.amount)), 2)
                            : formatBigInt(
                                BigInt(String(i.amount)),
                                preview.tokenDecimals,
                                4
                              ),
                        status: "pending",
                      }))
                    );
                    await executeMut.mutateAsync();
                  }}
                >
                  {executeMut.isPending
                    ? "Broadcasting…"
                    : `CONFIRM ${direction} · ${preview.validItems} WALLETS`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {executing.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Per-Wallet Execution</CardTitle>
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
                        {x.amount ?? "pending"}
                      </div>
                    </div>
                  </div>
                  <div>
                    {x.tx ? (
                      <ExplorerLink hash={x.tx} type="tx" />
                    ) : (
                      <span className="text-xs text-muted-foreground max-w-xs truncate">
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

function tokenBalColumn(
  balances: Record<string, WalletBalance>,
  _walletId: string,
  _token: TokenInfo | null,
  tokenBalances?: Record<string, string> | null
): React.ReactNode {
  const raw = tokenBalances?.[_walletId];
  if (raw !== undefined && raw !== null && _token) {
    try {
      const value = formatBigInt(
        BigInt(raw === "" ? "0" : raw),
        _token.decimals,
        4
      );
      return (
        <div className="font-mono">
          <div className="text-sm text-foreground">
            {value} <span className="text-xs">{_token.symbol}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            SafeSpend {formatUSDC(balances[_walletId]?.safeSpendable ?? 0n, 2)} USDC
          </div>
        </div>
      );
    } catch {
      // fallthrough
    }
  }
  return (
    <span className="text-xs text-muted-foreground">
      Loading… · SafeSpend {formatUSDC(balances[_walletId]?.safeSpendable ?? 0n, 2)} USDC
    </span>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function MetricBox({
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
    <div className="flex items-center justify-between">
      <Label>{label}</Label>
      <span className={`font-mono ${tone ?? ""}`}>{value}</span>
    </div>
  );
}
