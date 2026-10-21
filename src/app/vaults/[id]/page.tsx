"use client";

import { useParams } from "next/navigation";
import VaultStudio from "@/components/vaults/VaultStudio";

export default function VaultDetailPage() {
  const params = useParams<{ id: string }>();
  const vaultId = typeof params.id === "string" ? params.id : "";
  if (!vaultId) return null;
  return <VaultStudio vaultId={vaultId} />;
}
