"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TokenInfoPanel,
  QuoteCard,
  RiskWarning,
  ConfirmationModalBody,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/trading/trade-components";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ExplorerLink } from "@/components/ui/explorer-link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowRightLeft,
  Fuel,
  RefreshCw,
  ShieldCheck,
  Activity,
  CheckCircle2,
  XCircle,
  Wallet as WalletIcon,
} from "lucide-react";
import type {
  TokenInfo,
  TradeQuote,
  Wallet,
  WalletBalance,
  TransactionRecord,
} from "@/types";
import { formatUSDC, parseUSDC } from "@/lib/blockchain/gas";
import { formatBigInt, shortAddress } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

type Direction = "BUY" | "SELL";

export default function TradingPage() {
  const sp = useSearchParams();
  const qc = useQueryClient();
  const defaultWalletId = sp.get("walletId") ?? "";

  const [direction, setDirection] = useState<Direction>("BUY");
  const [walletId, setWalletId] = useState(defaultWalletId);
  const [tokenAddr, setTokenAddr] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [sellPct, setSellPct] = useState<number | null>(null);
  const [slippage, setSlippage] = useState(100); // bps, default 1%
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [txResult, setTxResult] = useState<TransactionRecord | null>(null);
  const [risk, setRisk] = useState<{ errors: string[]; warnings: string[] }>({
    errors: [],
    warnings: [],
  });
  const [toast, setToast] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["wallets-trading"],
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
    if (!walletId && wallets[0]) setWalletId(wallets[0].id);
  }, [wallets, walletId]);

  const wallet = wallets.find((w) => w.id === walletId);
  const walletBal = wallet ? balances[wallet.id] : undefined;

  const tokenBalance: bigint = useQuery({
    queryKey: ["tokenBalance", wallet?.address, token?.address],
    queryFn: async (): Promise<bigint> => {
      if (!wallet || !token) return 0n;
      try {
        const r = await fetch(
          `/api/wallets/${wallet.id}/balance?token=${token.address}`
        ).then((x) => x.json());
        return r.tokenBalance ? BigInt(r.tokenBalance) : 0n;
      } catch {
        return 0n;
      }
    },
    initialData: 0n,
    enabled: !!wallet && !!token,
  }).data ?? 0n;

  const slippagePercent = useMemo(
    () => `${(slippage / 100).toFixed(2)}%`,
    [slippage]
  );

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
      setQuote(null);
      setRisk({ errors: j.token.error ? [j.token.error] : [], warnings: [] });
    },
    onError: (e) => {
      setToken({
        address: tokenAddr as `0x${string}`,
        symbol: "???",
        name: "Unknown",
        decimals: 18,
        totalSupply: 0n,
        hasRoute: false,
        verified: false,
        error: e instanceof Error ? e.message : "Invalid token",
      });
    },
  });

  const quoteMut = useMutation({
    mutationFn: async () => {
      if (!token || !wallet) throw new Error("missing token/wallet");
      const amtRaw = amountInput.trim();
      let amt: bigint;
      if (direction === "BUY") {
        amt =
          amtRaw && !isNaN(Number(amtRaw))
            ? parseUSDC(amtRaw)
            : 0n;
      } else {
        const dec = token.decimals;
        if (!amtRaw || isNaN(Number(amtRaw))) amt = 0n;
        else {
          const [int, decPart = ""] = amtRaw.split(".");
          const padded = (decPart + "0".repeat(dec)).slice(0, dec);
          amt = BigInt(int + padded);
        }
      }
      if (amt <= 0n) throw new Error("Enter an amount");
      const r = await fetch("/api/trading/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletId: wallet.id,
          tokenAddress: token.address,
          direction,
          amount: amt.toString(),
          slippageBps: slippage,
        }),
      });
      const j = await r.json();
      return j as {
        quote: TradeQuote;
        token: TokenInfo;
        risk: { errors: string[]; warnings: string[] };
      };
    },
    onSuccess: (j) => {
      setQuote(j.quote);
      setRisk(j.risk);
    },
    onError: (e) =>
      setToast(e instanceof Error ? e.message : "Quote failed"),
  });

  const executeMut = useMutation({
    mutationFn: async () => {
      if (!quote || !token || !wallet) throw new Error("missing");
      const r = await fetch(`/api/trading/${direction.toLowerCase()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletId: wallet.id,
          tokenAddress: token.address,
          direction,
          amount: quote.inputAmount.toString(),
          slippageBps: slippage,
          confirm: true,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Execute failed");
      return j as { tx: TransactionRecord; token: TokenInfo; quote: TradeQuote };
    },
    onSuccess: (j) => {
      setTxResult(j.tx);
      setConfirmOpen(false);
      void qc.invalidateQueries({ queryKey: ["wallets"] });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (e) => {
      setToast(e instanceof Error ? e.message : "Trade execution failed");
      setTimeout(() => setToast(null), 5000);
    },
  });

  const canQuote =
    !!wallet &&
    !!token &&
    (direction === "SELL" ? tokenBalance > 0n : true) &&
    amountInput.trim() !== "";

  const onSetSlippagePct = (v: number) => {
    // convert percentage to bps (integer)
    setSlippage(Math.max(1, Math.min(5000, Math.round(v * 100))));
  };

  const applySellPct = async (pct: number) => {
    setSellPct(pct);
    if (!token) return;
    const part = (tokenBalance * BigInt(pct)) / 100n;
    const dec = token.decimals;
    const whole = part / 10n ** BigInt(dec);
    const remain = part - whole * 10n ** BigInt(dec);
    const decStr = remain.toString(10).padStart(dec, "0").replace(/0+$/, "");
    const str = `${whole.toString()}${decStr ? "." + decStr : ""}`;
    setAmountInput(str);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-primary font-bold">
            TRADING
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
            Buy / Sell
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Execute authorized DEX trades on ARC Mainnet. USDC is the native
            gas asset; all order sizes are constrained by wallet safe-spendable
            balance and risk controls.
          </p>
        </div>
        <Badge variant="muted">
          Swap Router 0x53bf…6f77 · Factory 0xf0db…3918 · Bot Fee 0 USDC
        </Badge>
      </header>

      {toast && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
          {toast}
        </div>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <Card className="xl:col-span-4 h-full">
          <CardHeader>
            <CardTitle>TOKEN INFORMATION</CardTitle>
            <CardDescription>
              Validate contract, liquidity, and swap route before quoting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="tok">Token Contract Address</Label>
              <div className="flex gap-2">
                <Input
                  id="tok"
                  placeholder="0x… (40 hex chars)"
                  className="font-mono"
                  value={tokenAddr}
                  onChange={(e) => {
                    let raw = e.target.value.trim();
                    if (raw) {
                      const onlyHex = raw.replace(/[^0-9a-fA-Fx]/g, "");
                      if (/^[0-9a-fA-F]{40}$/.test(onlyHex)) {
                        raw = "0x" + onlyHex;
                      } else if (
                        /^0x[0-9a-fA-F]{40}$/.test(onlyHex) ||
                        onlyHex.toLowerCase().startsWith("0x")
                      ) {
                        raw = onlyHex;
                      }
                    }
                    setTokenAddr(raw);
                    if (token) setToken(null);
                    if (quote) setQuote(null);
                  }}
                />
                <Button
                  variant="outline"
                  disabled={
                    !/^0x[0-9a-fA-F]{40}$/.test(tokenAddr) ||
                    validateTokenMut.isPending
                  }
                  onClick={() => validateTokenMut.mutate(tokenAddr.trim())}
                >
                  {validateTokenMut.isPending ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-3 w-3" />
                  )}
                  Validate
                </Button>
              </div>
            </div>
            <TokenInfoPanel
              token={token}
              loading={validateTokenMut.isPending}
            />
          </CardContent>
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-primary" />
              TRADING PANEL
            </CardTitle>
            <CardDescription>
              Select wallet, direction, and amount then request a quote.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={direction} onValueChange={(v) => setDirection(v as Direction)}>
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="BUY" className="data-[state=active]:text-success">
                  <ArrowDownToLine className="h-3.5 w-3.5 mr-2" />
                  BUY
                </TabsTrigger>
                <TabsTrigger
                  value="SELL"
                  className="data-[state=active]:text-destructive"
                >
                  <ArrowUpFromLine className="h-3.5 w-3.5 mr-2" />
                  SELL
                </TabsTrigger>
              </TabsList>
              <TabsContent value="BUY" className="space-y-3 mt-4">
                <TradeForm
                  wallets={wallets.filter((w) => w.enabled)}
                  walletId={walletId}
                  setWalletId={setWalletId}
                  balances={balances}
                  direction="BUY"
                  tokenSymbol={token?.symbol ?? "TOKEN"}
                  amountInput={amountInput}
                  setAmountInput={setAmountInput}
                  slippage={slippage}
                  setSlippagePct={onSetSlippagePct}
                  slippagePercent={slippagePercent}
                  canQuote={canQuote}
                  quotePending={quoteMut.isPending}
                  onQuote={() => quoteMut.mutate()}
                  tokenBal={0n}
                  applySellPct={null}
                  sellPct={null}
                />
              </TabsContent>
              <TabsContent value="SELL" className="space-y-3 mt-4">
                <TradeForm
                  wallets={wallets.filter((w) => w.enabled)}
                  walletId={walletId}
                  setWalletId={setWalletId}
                  balances={balances}
                  direction="SELL"
                  tokenSymbol={token?.symbol ?? "TOKEN"}
                  amountInput={amountInput}
                  setAmountInput={setAmountInput}
                  slippage={slippage}
                  setSlippagePct={onSetSlippagePct}
                  slippagePercent={slippagePercent}
                  canQuote={canQuote}
                  quotePending={quoteMut.isPending}
                  onQuote={() => quoteMut.mutate()}
                  tokenBal={tokenBalance}
                  applySellPct={applySellPct}
                  sellPct={sellPct}
                  tokenDecimals={token?.decimals ?? 18}
                />
              </TabsContent>
            </Tabs>

            <QuoteCard quote={quote} token={token} />
            <RiskWarning errors={risk.errors} warnings={risk.warnings} />

            <div className="flex flex-wrap gap-2 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setAmountInput("");
                  setQuote(null);
                  setRisk({ errors: [], warnings: [] });
                }}
              >
                Reset
              </Button>
              <Button
                variant="success"
                size="cta"
                disabled={
                  !quote ||
                  !quote.error === false ||
                  !!quote.error ||
                  risk.errors.length > 0 ||
                  executeMut.isPending
                }
                onClick={() => setConfirmOpen(true)}
              >
                {direction === "BUY" ? "BUY TOKEN" : "SELL TOKEN"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-3 h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WalletIcon className="h-4 w-4 text-primary" />
              WALLET &amp; RISK
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {wallet ? (
              <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold tracking-wider">
                    {wallet.label}
                  </span>
                  <Badge
                    variant={wallet.status === "READY" ? "success" : "warning"}
                  >
                    {wallet.status}
                  </Badge>
                </div>
                <ExplorerLink hash={wallet.address} type="address" />
                <Separator />
                <MiniRow
                  label="Native USDC"
                  value={
                    walletBal
                      ? `${formatUSDC(walletBal.nativeUSDC, 2)} USDC`
                      : "—"
                  }
                />
                <MiniRow
                  label="Gas Reserve"
                  value={
                    walletBal
                      ? `${formatUSDC(walletBal.gasReserve, 4)} USDC`
                      : "—"
                  }
                  tone="text-warning"
                />
                <MiniRow
                  label="Safe Spend"
                  value={
                    walletBal
                      ? `${formatUSDC(walletBal.safeSpendable, 2)} USDC`
                      : "—"
                  }
                  tone="text-success"
                />
                {token && (
                  <MiniRow
                    label={`${token.symbol} Balance`}
                    value={formatBigInt(tokenBalance, token.decimals, 6)}
                  />
                )}
              </div>
            ) : (
              <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground text-center">
                <WalletIcon className="h-10 w-10 mx-auto opacity-40 mb-2" />
                Select an authorized wallet.
              </div>
            )}

            <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                Risk Snapshot
              </div>
              <MiniRow
                label="Max Trade"
                value={`${formatUSDC(5000_000000n, 0)} USDC`}
              />
              <MiniRow label="Slippage" value={slippagePercent} />
              <MiniRow
                label="Min Gas Reserve"
                value={`${formatUSDC(100000n, 4)} USDC`}
              />
              <MiniRow label="Bot Fee" value="0.00 USDC" tone="text-success" />
            </div>

            {txResult && (
              <div className="rounded-md border border-border bg-background p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Last Transaction
                  </span>
                  {txResult.status === "CONFIRMED" ? (
                    <Badge variant="success">CONFIRMED</Badge>
                  ) : (
                    <Badge variant="default">{txResult.status}</Badge>
                  )}
                </div>
                {txResult.txHash && (
                  <ExplorerLink hash={txResult.txHash} type="tx" />
                )}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div>
                    <span className="stat-label">Block</span>
                    <div>{txResult.blockNumber ?? "—"}</div>
                  </div>
                  <div>
                    <span className="stat-label">Gas</span>
                    <div>
                      {txResult.gasUsed
                        ? `${formatUSDC(txResult.gasUsed, 4)} USDC`
                        : "—"}
                    </div>
                  </div>
                </div>
                {txResult.error && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive space-y-1">
                    <div className="font-bold uppercase tracking-wider flex items-center gap-2">
                      <XCircle className="h-3 w-3" /> Transaction Failed
                    </div>
                    <div className="font-mono break-all">{txResult.error}</div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {direction === "BUY" ? "Confirm Buy" : "Confirm Sell"}
            </DialogTitle>
            <DialogDescription>
              This operation will sign and broadcast a swap on ARC Mainnet.
            </DialogDescription>
          </DialogHeader>
          {quote && token && wallet && (
            <ConfirmationModalBody
              title={`${direction} ${token.symbol} · ARC MAINNET`}
              warning={risk.warnings[0]}
              confirmLabel={`CONFIRM ${direction}`}
              confirmDisabled={risk.errors.length > 0 || executeMut.isPending}
              summary={[
                { label: "Wallet", value: `${wallet.label}` },
                {
                  label: "Input",
                  value: `${formatBigInt(
                    quote.inputAmount,
                    direction === "BUY" ? 6 : token.decimals,
                    6
                  )} ${direction === "BUY" ? "USDC" : token.symbol}`,
                },
                {
                  label: "Expected Output",
                  value: `${formatBigInt(
                    quote.expectedOutput,
                    direction === "BUY" ? token.decimals : 6,
                    6
                  )} ${direction === "BUY" ? token.symbol : "USDC"}`,
                  tone: "text-success",
                },
                {
                  label: "Minimum Received",
                  value: `${formatBigInt(
                    quote.minimumOutput,
                    direction === "BUY" ? token.decimals : 6,
                    6
                  )} ${direction === "BUY" ? token.symbol : "USDC"}`,
                },
                {
                  label: "Price Impact",
                  value: `${(quote.priceImpactBps / 100).toFixed(2)}%`,
                  tone:
                    quote.priceImpactBps >= 500
                      ? "text-destructive"
                      : "text-foreground",
                },
                {
                  label: "Estimated Gas",
                  value: `${formatUSDC(quote.estimatedGas, 4)} USDC`,
                  tone: "text-warning",
                },
                { label: "Bot Fee", value: "0.00 USDC", tone: "text-success" },
              ]}
              onCancel={() => setConfirmOpen(false)}
              onConfirm={() => executeMut.mutate()}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TradeForm({
  wallets,
  walletId,
  setWalletId,
  balances,
  direction,
  tokenSymbol,
  amountInput,
  setAmountInput,
  slippage,
  setSlippagePct,
  slippagePercent,
  canQuote,
  quotePending,
  onQuote,
  tokenBal,
  applySellPct,
  sellPct,
  tokenDecimals = 18,
}: {
  wallets: Wallet[];
  walletId: string;
  setWalletId: (s: string) => void;
  balances: Record<string, WalletBalance>;
  direction: Direction;
  tokenSymbol: string;
  amountInput: string;
  setAmountInput: (s: string) => void;
  slippage: number;
  setSlippagePct: (v: number) => void;
  slippagePercent: string;
  canQuote: boolean;
  quotePending: boolean;
  onQuote: () => void;
  tokenBal: bigint;
  applySellPct: null | ((p: number) => void);
  sellPct: number | null;
  tokenDecimals?: number;
}) {
  const bal = balances[walletId];
  void bal;
  return (
    <>
      <div>
        <Label>Wallet</Label>
        <Select value={walletId} onValueChange={setWalletId}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select wallet" />
          </SelectTrigger>
          <SelectContent>
            {wallets.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.label} · {shortAddress(w.address)} · Safe{" "}
                {formatUSDC(balances[w.id]?.safeSpendable ?? 0n, 0)} USDC
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label>
            Amount ({direction === "BUY" ? "USDC" : tokenSymbol})
          </Label>
          {direction === "BUY" && bal ? (
            <button
              type="button"
              className="text-[11px] uppercase tracking-wider text-primary hover:underline"
              onClick={() => setAmountInput(formatUSDC(bal.safeSpendable, 6))}
            >
              Max Safe
            </button>
          ) : direction === "SELL" ? (
            <span className="text-[11px] text-muted-foreground font-mono">
              Balance: {formatBigInt(tokenBal, tokenDecimals, 6)} {tokenSymbol}
            </span>
          ) : null}
        </div>
        <Input
          className="mt-1 text-lg font-mono"
          placeholder="0.00"
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
        />
      </div>

      {direction === "SELL" && applySellPct && (
        <div className="grid grid-cols-4 gap-2">
          {[25, 50, 75, 100].map((p) => (
            <Button
              key={p}
              size="sm"
              variant={sellPct === p ? "default" : "outline"}
              onClick={() => applySellPct(p)}
            >
              {p}%
            </Button>
          ))}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label>Slippage Tolerance</Label>
          <span className="text-xs font-mono text-foreground">
            {slippagePercent}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-2">
          {[0.1, 0.5, 1, 3].map((p) => (
            <Button
              key={p}
              size="sm"
              variant={Math.round(p * 100) === slippage ? "default" : "outline"}
              onClick={() => setSlippagePct(p)}
            >
              {p}%
            </Button>
          ))}
        </div>
        <input
          type="range"
          min={1}
          max={5000}
          value={slippage}
          onChange={(e) => setSlippagePct(Number(e.target.value) / 100)}
          className="w-full accent-primary"
        />
      </div>

      <div className="pt-2 flex flex-wrap gap-2 justify-end">
        <Button
          variant="success"
          size="cta"
          disabled={!canQuote || quotePending}
          onClick={onQuote}
        >
          <Fuel className="h-3.5 w-3.5" />
          {quotePending ? "Calculating…" : "GET QUOTE"}
        </Button>
      </div>
    </>
  );
}

function MiniRow({
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
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className={`font-mono text-sm ${tone ?? ""}`}>{value}</span>
    </div>
  );
}
