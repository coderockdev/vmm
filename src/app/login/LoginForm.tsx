"use client";

import React, { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm({
  needsPassword,
  userName,
}: {
  needsPassword: boolean;
  userName: string;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const nextPath = useMemo(() => {
    const n = search.get("next") || "/";
    return n.startsWith("/") ? n : "/";
  }, [search]);

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao entrar");
      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-card" onSubmit={onSubmit}>
      <div className="login-brand">
        <strong>VMM</strong>
        <span>Viral Money Machine</span>
      </div>
      <h1>Entrar</h1>
      <p className="login-hint">
        {needsPassword
          ? `Olá, ${userName}. Digite a senha do time para continuar.`
          : `Olá, ${userName}. Acesso local — clique em Entrar para abrir o workspace.`}
      </p>
      {needsPassword && (
        <label className="login-field">
          <span>Senha</span>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </label>
      )}
      {error && <p className="generation-error">{error}</p>}
      <button type="submit" className="login-submit" disabled={loading}>
        {loading ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
