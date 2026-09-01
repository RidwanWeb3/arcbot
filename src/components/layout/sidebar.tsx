"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowRightLeft,
  Receipt,
  Settings,
  X,
  Activity,
  Zap,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const NAV = [
  {
    group: "OVERVIEW",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    group: "WALLET MANAGEMENT",
    items: [
      {
        href: "/wallets",
        label: "Wallet Pool",
        icon: Wallet,
      },
    ],
  },
  {
    group: "TREASURY",
    items: [
      {
        href: "/distribution",
        label: "Distribution",
        icon: ArrowDownToLine,
      },
      {
        href: "/collect",
        label: "Collect",
        icon: ArrowUpFromLine,
      },
    ],
  },
  {
    group: "TRADING",
    items: [
      {
        href: "/trading",
        label: "Buy / Sell",
        icon: ArrowRightLeft,
      },
      {
        href: "/mass-trading",
        label: "Mass Execution",
        icon: Layers,
      },
    ],
  },
  {
    group: "ACTIVITY",
    items: [
      {
        href: "/transactions",
        label: "Transactions",
        icon: Receipt,
      },
    ],
  },
  {
    group: "SYSTEM",
    items: [
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
      },
    ],
  },
] as const;

export function Sidebar({
  open,
  onClose,
  connected,
}: {
  open: boolean;
  onClose: () => void;
  connected: boolean;
}) {
  const pathname = usePathname();
  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 md:hidden transition-opacity",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={cn(
          "fixed md:sticky top-0 left-0 z-50 h-screen w-72 shrink-0 border-r border-border bg-background/95 backdrop-blur-md flex flex-col transition-transform md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="relative h-8 w-8 rounded-md bg-gradient-to-br from-primary/80 to-primary/30 flex items-center justify-center border border-primary/40">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="leading-tight">
              <div className="text-xs font-bold uppercase tracking-widest text-foreground">
                ARC TRADING
              </div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Terminal
              </div>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="md:hidden"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary/60 border border-border">
            <Activity
              className={cn(
                "h-3.5 w-3.5",
                connected ? "text-success animate-pulse-slow" : "text-warning"
              )}
            />
            <div className="text-[10px] uppercase tracking-widest flex-1">
              <div className="text-muted-foreground">ARC MAINNET · 5042</div>
              <div
                className={cn(
                  "font-semibold mt-0.5",
                  connected ? "text-success" : "text-warning"
                )}
              >
                {connected ? "CONNECTED · USDC GAS" : "RPC OFFLINE"}
              </div>
            </div>
          </div>
        </div>

        <TooltipProvider>
          <nav className="flex-1 overflow-y-auto p-3 space-y-5">
            {NAV.map((g) => (
              <div key={g.group} className="space-y-1">
                <div className="px-3 text-[10px] font-bold tracking-[0.2em] text-muted-foreground">
                  {g.group}
                </div>
                <ul className="space-y-0.5">
                  {g.items.map((item) => {
                    const active =
                      pathname === item.href ||
                      pathname.startsWith(item.href + "/");
                    return (
                      <li key={item.href}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              href={item.href}
                              onClick={onClose}
                              className={cn(
                                "group flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                                active
                                  ? "bg-primary/10 text-primary border border-primary/20 shadow-sm"
                                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                              )}
                            >
                              <item.icon
                                className={cn(
                                  "h-4 w-4 shrink-0",
                                  active
                                    ? "text-primary"
                                    : "text-muted-foreground group-hover:text-foreground"
                                )}
                              />
                              <span className="font-medium tracking-wide">
                                {item.label}
                              </span>
                              {active && (
                                <Badge
                                  variant="default"
                                  className="ml-auto h-5 px-1.5 text-[9px]"
                                >
                                  ACTIVE
                                </Badge>
                              )}
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent side="right" align="center">
                            {item.label}
                          </TooltipContent>
                        </Tooltip>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </TooltipProvider>

        <div className="border-t border-border px-5 py-3 space-y-1 text-[10px] uppercase tracking-widest">
          <div className="flex justify-between text-muted-foreground">
            <span>ARC MAINNET</span>
            <span>CHAIN 5042</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>USDC GAS</span>
            <span className="text-success">BOT FEE 0 USDC</span>
          </div>
        </div>
      </aside>
    </>
  );
}
