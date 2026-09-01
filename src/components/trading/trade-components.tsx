import type { TokenInfo, TradeQuote } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { formatUSDC } from "@/lib/blockchain/gas";
import { formatBigInt, shortAddress } from "@/lib/utils";
import { ExplorerLink } from "@/components/ui/explorer-link";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReactNode } from "react";

export function TokenInfoPanel({
  token,
  loading,
}: {
  token: TokenInfo | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Validating token…</CardTitle>
        </CardHeader>
        <CardContent className="h-64 flex items-center justify-center text-muted-foreground text-sm animate-pulse">
          Reading contract metadata &amp; liquidity from ARC
        </CardContent>
      </Card>
    );
  }
  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Token Information</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm py-8 text-center">
          Enter a token contract address to validate liquidity &amp; swap route on ARC.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="space-y-1">
          <CardTitle>${token.symbol}</CardTitle>
          <div className="text-xs text-muted-foreground">{token.name}</div>
        </div>
        {token.verified ? (
          <Badge variant="success">VERIFIED</Badge>
        ) : (
          <Badge variant="warning">
            {token.error ? "INVALID" : "UNVERIFIED"}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <Row label="Contract">
          <ExplorerLink hash={token.address} type="address" />
        </Row>
        <Row label="Decimals">{token.decimals}</Row>
        <Row label="Symbol">{token.symbol}</Row>
        <Row label="Has Route">
          {token.hasRoute ? (
            <Badge variant="success">YES · {shortAddress(token.address)}</Badge>
          ) : (
            <Badge variant="destructive">NO USDC ROUTE</Badge>
          )}
        </Row>
        <Row label="Liquidity (USDC)">
          <span className="font-mono text-success text-sm">
            {token.liquidityUSDC !== undefined
              ? `$${formatUSDC(token.liquidityUSDC, 2)}`
              : "—"}
          </span>
        </Row>
        {token.error && (
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning space-y-1">
            <div className="flex items-center gap-2 font-bold uppercase tracking-wider">
              <AlertTriangle className="h-3.5 w-3.5" /> Token Warning
            </div>
            <div className="font-mono break-all">{token.error}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <Label className="text-[10px]">{label}</Label>
      <div className="text-sm font-mono text-foreground">{children}</div>
    </div>
  );
}

export function QuoteCard({
  quote,
  token,
}: {
  quote: TradeQuote | null;
  token: TokenInfo | null;
}) {
  if (!quote) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Quote</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm py-8 text-center">
          Get a quote after validating the token and selecting a trade amount.
        </CardContent>
      </Card>
    );
  }
  const pi = (quote.priceImpactBps / 100).toFixed(2);
  const piHigh = quote.priceImpactBps >= 500;
  const ok = !quote.error;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="space-y-1">
          <CardTitle>
            {quote.direction === "BUY" ? (
              <>
                <ArrowDownToLine className="h-4 w-4 inline mr-2 text-success" />
                Buy Quote
              </>
            ) : (
              <>
                <ArrowUpFromLine className="h-4 w-4 inline mr-2 text-destructive" />
                Sell Quote
              </>
            )}
          </CardTitle>
          <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
            {quote.route}
          </div>
        </div>
        {ok ? (
          <Badge variant="success">READY</Badge>
        ) : (
          <Badge variant="destructive">QUOTE ERROR</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <Row
          label="Input"
          children={
            <span className="text-success">
              {formatBigInt(
                quote.inputAmount,
                quote.inputSymbol === "USDC" ? 6 : token?.decimals ?? 18,
                6
              )}{" "}
              {quote.inputSymbol}
            </span>
          }
        />
        <Row
          label="Expected Output"
          children={
            <span className="font-bold">
              {formatBigInt(
                quote.expectedOutput,
                quote.expectedOutputSymbol === "USDC"
                  ? 6
                  : token?.decimals ?? 18,
                6
              )}{" "}
              {quote.expectedOutputSymbol}
            </span>
          }
        />
        <Row
          label="Minimum Received"
          children={
            <span className="font-mono">
              {formatBigInt(
                quote.minimumOutput,
                quote.expectedOutputSymbol === "USDC"
                  ? 6
                  : token?.decimals ?? 18,
                6
              )}{" "}
              {quote.expectedOutputSymbol}
            </span>
          }
        />
        <Separator />
        <Row
          label="Price Impact"
          children={
            <span className={piHigh ? "text-destructive" : "text-foreground"}>
              {pi}%
            </span>
          }
        />
        <Row
          label="Estimated Gas"
          children={<span>{formatUSDC(quote.estimatedGas, 4)} USDC</span>}
        />
        <Row
          label="DEX Fee"
          children={<span>{formatUSDC(quote.dexFee, 6)} USDC</span>}
        />
        <Row
          label="Bot Fee"
          children={<span className="text-success">0.00 USDC</span>}
        />
        {quote.error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive space-y-1">
            <div className="flex items-center gap-2 font-bold uppercase tracking-wider">
              <XCircle className="h-3.5 w-3.5" /> Quote Failed
            </div>
            <div className="font-mono break-all">{quote.error}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RiskWarning({
  errors,
  warnings,
}: {
  errors: string[];
  warnings: string[];
}) {
  if (errors.length === 0 && warnings.length === 0) return null;
  return (
    <div className="space-y-2">
      {errors.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-destructive">
            <XCircle className="h-3.5 w-3.5" /> TRANSACTION BLOCKED
          </div>
          <ul className="mt-2 space-y-1 text-xs text-destructive/90 list-disc list-inside">
            {errors.map((e, i) => (
              <li key={i}>Reason: {e}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-warning">
            <AlertTriangle className="h-3.5 w-3.5" /> Risk Warnings
          </div>
          <ul className="mt-2 space-y-1 text-xs text-warning/90 list-disc list-inside">
            {warnings.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ConfirmationModalBody({
  title,
  summary,
  confirmLabel,
  onConfirm,
  onCancel,
  confirmDisabled,
  warning,
}: {
  title: string;
  summary: Array<{ label: string; value: string | ReactNode; tone?: string }>;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmDisabled?: boolean;
  warning?: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase tracking-widest text-primary font-bold">
          {title}
        </div>
        {warning && (
          <div className="text-xs text-warning mt-1 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> {warning}
          </div>
        )}
      </div>
      <Separator />
      <div className="space-y-2">
        {summary.map((row, i) => (
          <div
            key={i}
            className="flex items-center justify-between text-sm gap-4"
          >
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
              {row.label}
            </span>
            <span
              className={`font-mono text-right ${row.tone ?? "text-foreground"}`}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
      <Separator />
      <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
        <Checkbox id="confirm-check" />
        <label htmlFor="confirm-check">
          I confirm the above amounts and authorize this on-chain operation.
        </label>
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="cta" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="success"
          size="cta"
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, Input, Label };
