"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export default function TanStackProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 12_000,
            refetchOnWindowFocus: false,
            retry: (count, err) => {
              const msg =
                err instanceof Error ? err.message : String(err ?? "");
              if (msg.includes("429") || /rate|timeout/i.test(msg))
                return count < 3;
              return count < 1;
            },
          },
        },
      })
  );
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
