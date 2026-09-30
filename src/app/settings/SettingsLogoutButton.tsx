"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export function SettingsLogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      disabled={busy}
      style={{
        height: 40,
        padding: "0 16px",
        borderRadius: 10,
        border: "1px solid #d8dbe2",
        background: "#fff",
        fontWeight: 600,
        cursor: busy ? "default" : "pointer",
      }}
    >
      {busy ? "Saindo…" : "Deslogar"}
    </button>
  );
}
