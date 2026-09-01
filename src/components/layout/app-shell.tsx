"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Suspense, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["health-shell"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/health").then((x) => x.json());
        return r as { ok: boolean };
      } catch {
        return { ok: false };
      }
    },
    refetchInterval: 30_000,
    retry: 1,
  });

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar
        open={open}
        onClose={() => setOpen(false)}
        connected={!!data?.ok}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onOpenSidebar={() => setOpen(true)} />
        <main className="flex-1 min-w-0 w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
                Loading…
              </div>
            }
          >
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
