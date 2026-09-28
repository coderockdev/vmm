"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { VideoFormat } from "../core/types";

const MAX_LEN = 500;

function VideoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function ShortIcon() {
  return (
    <svg width="12" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="6" y="2" width="12" height="20" rx="3" />
    </svg>
  );
}

export function QuickCreate({ channels }: { channels: Array<{ id: string; name: string; coverColor: string }> }) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [format, setFormat] = useState<VideoFormat>("video");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!topic.trim() || !channelId) return;
    setSending(true);
    setError(null);
    try {
      const planRes = await fetch(`/api/channels/${channelId}/content-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, quantity: 1, format }),
      });
      const planData = await planRes.json();
      if (!planData.plan) throw new Error(planData.error ?? "Falha ao criar plano de conteúdo");

      const genRes = await fetch(`/api/channels/${channelId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: planData.plan.id }),
      });
      const genData = await genRes.json();
      if (!genData.projectIds) throw new Error(genData.error ?? "Falha ao enviar para a fila");

      setTopic("");
      router.push("/queue");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, padding: 20 }}>
      <div style={{ position: "relative" }}>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value.slice(0, MAX_LEN))}
          placeholder="Descreva sua ideia de vídeo ou short..."
          style={{ width: "100%", minHeight: 80, resize: "none", border: "1px solid var(--border)" }}
        />
        <span style={{ position: "absolute", bottom: 10, right: 12, fontSize: 11, color: "var(--text-dim)" }}>
          {topic.length}/{MAX_LEN}
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Canal</div>
            <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Formato</div>
            <div style={{ display: "flex", gap: 6 }}>
              {(
                [
                  { key: "video", label: "Vídeo", icon: <VideoIcon /> },
                  { key: "short", label: "Short", icon: <ShortIcon /> },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFormat(f.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    border: "1px solid " + (format === f.key ? "var(--accent)" : "var(--border)"),
                    background: format === f.key ? "var(--accent-soft)" : "transparent",
                    color: format === f.key ? "var(--accent)" : "var(--text)",
                    borderRadius: 8,
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {f.icon} {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !topic.trim()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--accent)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            padding: "14px 22px",
            borderRadius: 12,
            border: "none",
            cursor: sending ? "default" : "pointer",
            opacity: sending || !topic.trim() ? 0.6 : 1,
          }}
        >
          {sending ? "Enviando..." : "✳ Enviar para a fila →"}
        </button>
      </div>
      {error && <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 10 }}>{error}</div>}
    </div>
  );
}
