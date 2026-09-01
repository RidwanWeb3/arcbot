"use client";

import { Menu, RefreshCw, ServerCrash, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export function Topbar({
  onOpenSidebar,
}: {
  onOpenSidebar: () => void;
}) {
  const [refreshAt, setRefreshAt] = useState(0);
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["health", refreshAt],
    queryFn: async () => {
      const r = await fetch("/api/health").then((x) => x.json());
      return r as {
        ok: boolean;
        chainId?: number;
        blockNumber?: string;
        error?: string;
      };
    },
    retry: false,
    refetchInterval: 30_000,
  });

  const ok = !!data?.ok;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center h-14 px-4 sm:px-6 gap-3">
        <Button
          size="icon"
          variant="ghost"
          className="md:hidden"
          onClick={onOpenSidebar}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="hidden sm:block text-xs font-bold uppercase tracking-[0.25em] text-foreground/80">
          ARC Multi-Wallet Treasury &amp; Trading Terminal
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <div
            className={cn(
              "hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md border text-[10px] uppercase tracking-widest",
              ok
                ? "border-success/30 bg-success/5 text-success"
                : "border-warning/30 bg-warning/5 text-warning"
            )}
          >
            {ok ? (
              <CheckCircle2 className="h-3 w-3 animate-pulse-slow" />
            ) : (
              <ServerCrash className="h-3 w-3" />
            )}
            <span className="font-bold">
              {ok
                ? `ARC MAINNET · CHAIN ${data?.chainId ?? 5042} · USDC GAS`
                : "RPC UNAVAILABLE · CHECK ARC_RPC_URL"}
            </span>
            {data?.blockNumber && (
              <Badge variant="muted" className="font-mono">
                BLK {BigInt(data.blockNumber).toString()}
              </Badge>
            )}
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setRefreshAt(Date.now());
              void refetch();
            }}
            aria-label="Refresh network status"
          >
            <RefreshCw
              className={cn("h-4 w-4", isFetching && "animate-spin")}
            />
          </Button>
        </div>
      </div>
    </header>
  );
}
