import { getEdition } from "@/core/edition/edition";
import type { ReactNode } from "react";

export function AdminGate({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  if (!getEdition().features.admin) return <>{fallback}</>;
  return <>{children}</>;
}
