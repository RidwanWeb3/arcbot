import { Card, CardContent } from "@/components/ui/card";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BalanceCard({
  label,
  value,
  sub,
  icon,
  tone = "default",
  action,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  tone?: "default" | "success" | "warning" | "destructive" | "muted";
  action?: ReactNode;
}) {
  const toneCls = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <Card className="terminal-card-hover">
      <CardContent className="p-5 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="stat-label">{label}</div>
          {icon && (
            <div className="h-8 w-8 rounded-md border border-border bg-muted/40 flex items-center justify-center text-muted-foreground">
              {icon}
            </div>
          )}
        </div>
        <div className={cn("stat-value", toneCls)}>{value}</div>
        {(sub || action) && (
          <div className="flex items-center justify-between gap-2 pt-0.5">
            {sub ? (
              <div className="text-[11px] text-muted-foreground font-mono tracking-wide">
                {sub}
              </div>
            ) : (
              <div />
            )}
            {action}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
