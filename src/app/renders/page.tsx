import React from "react";
import { listAllProjects } from "../../core/repo/projects";
import { getChannel } from "../../core/repo/channels";
import { ensureSeeded } from "../../core/seed";
import { mediaUrl } from "../../core/media";

export const dynamic = "force-dynamic";

export default async function RendersPage() {
  await ensureSeeded();
  const projects = (await listAllProjects()).filter((p) => p.status === "completed" && p.renderPath);
  const cards = await Promise.all(projects.map(async (p) => ({ p, channel: await getChannel(p.channelId) })));

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>Renders</h1>
      {projects.length === 0 && <p style={{ color: "var(--text-dim)" }}>Nenhum render concluído ainda.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {cards.map(({ p, channel }) => {
          const url = mediaUrl(p.channelId, p.renderPath)!;
          return (
            <div key={p.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
              <video src={url} controls style={{ width: "100%", display: "block", background: "#000", maxHeight: 220 }} />
              <div style={{ padding: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{p.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>
                  {channel?.name} · {p.durationMinutes} min · {p.format}
                </div>
                <a href={url} download style={{ fontSize: 12, color: "var(--accent)", display: "inline-block", marginTop: 8 }}>
                  Abrir arquivo
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
