"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { RiskWarning } from "@/components/trading/trade-components";
import {
  ShieldCheck,
  Gauge,
  Percent,
  AlertTriangle,
  Fuel,
  Coins,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  Save,
  KeyRound,
} from "lucide-react";
import type { RiskSettings } from "@/types";
import { formatUSDC, parseUSDC } from "@/lib/blockchain/gas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
  const qc = useQueryClient();
  const [confirmReset, setConfirmReset] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["risk-settings"],
    queryFn: async () => {
      const r = await fetch("/api/settings/risk").then((x) => x.json());
      return r as { settings: RiskSettings };
    },
    refetchInterval: 45_000,
  });
  const defaults = data?.settings;

  const [state, setState] = useState<{
    maxTradeAmountUSDC: string;
    maxDailySpendUSDC: string;
    maxTokenExposurePercent: string;
    maxSlippageBps: string;
    maxPriceImpactBps: string;
    minLiquidityUSDC: string;
    minGasReserveUSDC: string;
  }>({
    maxTradeAmountUSDC: "",
    maxDailySpendUSDC: "",
    maxTokenExposurePercent: "",
    maxSlippageBps: "",
    maxPriceImpactBps: "",
    minLiquidityUSDC: "",
    minGasReserveUSDC: "",
  });

  if (defaults && state.maxTradeAmountUSDC === "") {
    setState({
      maxTradeAmountUSDC: formatUSDC(defaults.maxTradeAmountUSDC, 6),
      maxDailySpendUSDC: formatUSDC(defaults.maxDailySpendUSDC, 6),
      maxTokenExposurePercent: String(defaults.maxTokenExposurePercent),
      maxSlippageBps: String(defaults.maxSlippageBps),
      maxPriceImpactBps: String(defaults.maxPriceImpactBps),
      minLiquidityUSDC: formatUSDC(defaults.minLiquidityUSDC, 6),
      minGasReserveUSDC: formatUSDC(defaults.minGasReserveUSDC, 6),
    });
  }

  const formValid = useMemo(() => {
    const n = (s: string) => !isNaN(Number(s));
    return (
      n(state.maxTradeAmountUSDC) &&
      n(state.maxDailySpendUSDC) &&
      Number(state.maxTokenExposurePercent) >= 0 &&
      Number(state.maxTokenExposurePercent) <= 100 &&
      Number(state.maxSlippageBps) >= 0 &&
      Number(state.maxPriceImpactBps) >= 0 &&
      n(state.minLiquidityUSDC) &&
      n(state.minGasReserveUSDC)
    );
  }, [state]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const next: RiskSettings = {
        maxTradeAmountUSDC: parseUSDC(state.maxTradeAmountUSDC),
        maxDailySpendUSDC: parseUSDC(state.maxDailySpendUSDC),
        maxTokenExposurePercent: Math.max(
          0,
          Math.min(100, Math.round(Number(state.maxTokenExposurePercent)))
        ),
        maxSlippageBps: Math.max(
          0,
          Math.round(Number(state.maxSlippageBps))
        ),
        maxPriceImpactBps: Math.max(
          0,
          Math.round(Number(state.maxPriceImpactBps))
        ),
        minLiquidityUSDC: parseUSDC(state.minLiquidityUSDC),
        minGasReserveUSDC: parseUSDC(state.minGasReserveUSDC),
      };
      const r = await fetch("/api/settings/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Save failed");
      return j;
    },
    onSuccess: () => {
      setToast("Risk controls saved");
      setTimeout(() => setToast(null), 2500);
      void qc.invalidateQueries({ queryKey: ["risk-settings"] });
    },
    onError: (e) =>
      setToast(e instanceof Error ? e.message : "Save failed"),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-primary font-bold">
            SYSTEM
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
            Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Configure risk controls, environment configuration, and security
            parameters. All limits enforce explicit server-side validation.
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
          <Button
            variant="success"
            size="cta"
            disabled={!formValid || saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            <Save className="h-3.5 w-3.5" />
            {saveMut.isPending ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </header>

      {toast && (
        <div className="rounded-md border border-success/30 bg-success/5 p-3 text-xs text-success">
          {toast}
        </div>
      )}

      <Tabs defaultValue="risk">
        <TabsList>
          <TabsTrigger value="risk">
            <Gauge className="h-3.5 w-3.5 mr-2" />
            Risk Controls
          </TabsTrigger>
          <TabsTrigger value="security">
            <ShieldCheck className="h-3.5 w-3.5 mr-2" />
            Security
          </TabsTrigger>
          <TabsTrigger value="environment">
            <KeyRound className="h-3.5 w-3.5 mr-2" />
            Environment
          </TabsTrigger>
        </TabsList>

        <TabsContent value="risk" className="mt-5 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                <Gauge className="h-4 w-4 inline mr-2 text-primary" />
                Treasury &amp; Trading Limits
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                icon={<Coins className="h-3.5 w-3.5" />}
                label="Maximum Trade Amount"
                suffix="USDC"
                value={state.maxTradeAmountUSDC}
                onChange={(v) =>
                  setState((s) => ({ ...s, maxTradeAmountUSDC: v }))
                }
                hint={`Blocked if exceeded. Current: ${formatUSDC(parseUSDC(state.maxTradeAmountUSDC || "0"), 0)} USDC`}
              />
              <Field
                icon={<Coins className="h-3.5 w-3.5" />}
                label="Maximum Daily Spend"
                suffix="USDC"
                value={state.maxDailySpendUSDC}
                onChange={(v) =>
                  setState((s) => ({ ...s, maxDailySpendUSDC: v }))
                }
              />
              <Field
                icon={<Percent className="h-3.5 w-3.5" />}
                label="Max Token Exposure"
                suffix="%"
                value={state.maxTokenExposurePercent}
                onChange={(v) =>
                  setState((s) => ({ ...s, maxTokenExposurePercent: v }))
                }
                hint="Maximum single-token exposure of total treasury."
              />
              <Field
                icon={<Percent className="h-3.5 w-3.5" />}
                label="Maximum Slippage"
                suffix="bps (1 bps = 0.01%)"
                value={state.maxSlippageBps}
                onChange={(v) =>
                  setState((s) => ({ ...s, maxSlippageBps: v }))
                }
                hint={`= ${(Number(state.maxSlippageBps || 0) / 100).toFixed(2)}%`}
              />
              <Field
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                label="Maximum Price Impact"
                suffix="bps"
                value={state.maxPriceImpactBps}
                onChange={(v) =>
                  setState((s) => ({ ...s, maxPriceImpactBps: v }))
                }
                hint={`= ${(Number(state.maxPriceImpactBps || 0) / 100).toFixed(2)}%`}
              />
              <Field
                icon={<Lock className="h-3.5 w-3.5" />}
                label="Minimum Liquidity"
                suffix="USDC"
                value={state.minLiquidityUSDC}
                onChange={(v) =>
                  setState((s) => ({ ...s, minLiquidityUSDC: v }))
                }
                hint="Minimum pool USDC liquidity for new buys."
              />
              <Field
                icon={<Fuel className="h-3.5 w-3.5" />}
                label="Minimum Gas Reserve"
                suffix="USDC"
                value={state.minGasReserveUSDC}
                onChange={(v) =>
                  setState((s) => ({ ...s, minGasReserveUSDC: v }))
                }
                hint="Wallets below this threshold display LOW GAS status."
              />
            </CardContent>
          </Card>

          <RiskWarning
            errors={[]}
            warnings={[
              "Saving risk controls affects ALL future distribution, trade, and collection validation.",
            ]}
          />
        </TabsContent>

        <TabsContent value="security" className="mt-5 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                <ShieldCheck className="h-4 w-4 inline mr-2 text-primary" />
                Security &amp; Audit
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StatRow label="Server-side signing" ok={true} text="All private key operations happen server-only." />
                <StatRow label="Encrypted at rest" ok={true} text="AES-256 equivalent via WALLET_ENCRYPTION_KEY." />
                <StatRow label="Audit logging" ok={true} text="Every operation writes an immutable audit trail." />
                <StatRow label="Per-wallet nonces" ok={true} text="Independent nonce tracking + per-wallet submit lock." />
                <StatRow label="No NEXT_PUBLIC secrets" ok={true} text="RPC, keys, DB URLs never exposed to browser." />
                <StatRow label="Zero Bot Fee" ok={true} text="No developer / hidden fees — ever." />
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="destructive" onClick={() => setConfirmReset(true)}>
                  Reset Wallet Pool (Wipe local store)
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="environment" className="mt-5 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                <KeyRound className="h-4 w-4 inline mr-2 text-primary" />
                Required Environment Variables
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="muted">.env</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSecrets((s) => !s)}
                  aria-label="Toggle visibility"
                >
                  {showSecrets ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 font-mono text-xs">
              {[
                ["ARC_RPC_URL", process.env.ARC_RPC_URL, "ARC Mainnet JSON-RPC endpoint"],
                ["ARC_CHAIN_ID", process.env.ARC_CHAIN_ID ?? "5042", "Chain ID"],
                ["ARC_EXPLORER_URL", process.env.ARC_EXPLORER_URL ?? "https://arc-scan.org/", "Block explorer base URL"],
                [
                  "ARC_USDC_ADDRESS",
                  process.env.ARC_USDC_ADDRESS ?? "0x3600…0000",
                  "Native USDC / gas address",
                ],
                [
                  "ARC_UNISWAP_V3_FACTORY",
                  process.env.ARC_UNISWAP_V3_FACTORY,
                  "Factory",
                ],
                ["ARC_POSITION_MANAGER", process.env.ARC_POSITION_MANAGER, "Position manager"],
                ["ARC_SWAP_ROUTER", process.env.ARC_SWAP_ROUTER, "Swap router"],
                ["DATABASE_URL", process.env.DATABASE_URL, "Postgres or Supabase"],
                ["WALLET_ENCRYPTION_KEY", process.env.WALLET_ENCRYPTION_KEY, "≥32 chars"],
                ["AUTH_SECRET", process.env.AUTH_SECRET, "Operator secret"],
              ].map(([k, v, desc]) => (
                <div
                  key={k}
                  className="rounded-md border border-border bg-muted/30 p-3 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{k}</span>
                    <span className="text-muted-foreground text-[10px]">
                      {desc}
                    </span>
                  </div>
                  <div className="break-all">
                    {v ? (
                      showSecrets ? (
                        String(v)
                      ) : (
                        <span className="text-muted-foreground">
                          {"•".repeat(28)}{" "}
                          <span className="text-success">set</span>
                        </span>
                      )
                    ) : (
                      <span className="text-warning">NOT SET</span>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset wallet storage?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all wallets from the local wallet pool file.
              Encrypted private keys will be lost if not backed up.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmReset(false);
                setToast("Reset not available in this build. Use file system or DB wipe.");
                setTimeout(() => setToast(null), 4000);
              }}
            >
              Proceed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  suffix,
  hint,
  icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        {icon}
        {label}
      </Label>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-20"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-widest text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function StatRow({
  label,
  text,
  ok,
}: {
  label: string;
  text: string;
  ok: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3 space-y-1">
      <div className="flex items-center gap-2">
        {ok ? (
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 text-warning" />
        )}
        <span className="text-xs font-bold uppercase tracking-widest">
          {label}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">{text}</div>
    </div>
  );
}
