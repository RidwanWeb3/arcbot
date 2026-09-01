import { Badge } from "@/components/ui/badge";
import type { WalletStatus, TxStatus } from "@/types";

export function WalletStatusBadge({ status }: { status: WalletStatus }) {
  switch (status) {
    case "READY":
      return <Badge variant="success">READY</Badge>;
    case "LOW_BALANCE":
      return <Badge variant="warning">LOW BALANCE</Badge>;
    case "LOW_GAS":
      return <Badge variant="warning">LOW GAS</Badge>;
    case "DISABLED":
      return <Badge variant="muted">DISABLED</Badge>;
    case "ERROR":
      return <Badge variant="destructive">ERROR</Badge>;
  }
}

export function TxStatusBadge({ status }: { status: TxStatus }) {
  switch (status) {
    case "CONFIRMED":
      return <Badge variant="success">CONFIRMED</Badge>;
    case "READY":
    case "SUBMITTED":
    case "CONFIRMING":
    case "SIMULATING":
    case "CREATED":
    case "SUBMITTING":
      return <Badge variant="default">{status}</Badge>;
    case "FAILED":
    case "REVERTED":
      return <Badge variant="destructive">{status}</Badge>;
    case "CANCELLED":
      return <Badge variant="muted">{status}</Badge>;
  }
}
