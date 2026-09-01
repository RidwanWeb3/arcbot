"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getExplorerAddressUrl as _addr, getExplorerTxUrl as _tx } from "@/lib/blockchain/arc";

export function ExplorerLink({
  hash,
  type,
  label,
  className,
}: {
  hash: `0x${string}` | string;
  type: "tx" | "address";
  label?: string;
  className?: string;
}) {
  const url =
    type === "tx"
      ? _tx(hash as `0x${string}`)
      : _addr(hash as `0x${string}`);
  const display = label ?? short(hash, type);
  return (
    <Link
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-primary hover:underline font-mono text-xs ${className ?? ""}`}
    >
      <span>{display}</span>
      <ExternalLink className="h-3 w-3 opacity-70" />
    </Link>
  );
}

function short(hash: string, type: "tx" | "address") {
  if (type === "tx") {
    return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
  }
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}
