"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Erro na página</h1>
      <p style={{ color: "#666", marginBottom: 16 }}>{error.message || "Erro inesperado"}</p>
      <button type="button" onClick={() => reset()}>
        Tentar de novo
      </button>
    </div>
  );
}
