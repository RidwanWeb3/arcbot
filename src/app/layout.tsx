import type { Metadata, Viewport } from "next";
import "./globals.css";
import TanStackProvider from "@/components/providers/tanstack";
import { AppShell } from "@/components/layout/app-shell";
import { validateEnv } from "@/lib/env";

validateEnv();

export const metadata: Metadata = {
  title: "ARC Multi-Wallet Treasury & Trading Terminal",
  description:
    "Professional operations console for authorized ARC Mainnet wallet treasury management, USDC distribution, DEX trading, and balance collection.",
  applicationName: "ARC Trading Terminal",
  authors: [{ name: "Operator" }],
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <TanStackProvider>
          <AppShell>{children}</AppShell>
        </TanStackProvider>
      </body>
    </html>
  );
}
