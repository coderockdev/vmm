"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CostBreakdown, formatUsd } from "../../../core/usage/types";

type CostPeriod = "7d" | "30d" | "90d" | "all";

type UsageSummary = {
  period: CostPeriod;
  since: string | null;
  totalUsd: number;
  byStage: CostBreakdown;
  byProvider: { provider: string; usd: number; count: number }[];
  projects: {
    id: string;
    title: string;
    status: string;
    createdAt: string;
    totalUsd: number;
    breakdown: CostBreakdown;
  }[];
  recentEvents: {
    id: string;
    stage: string;
    stageLabel: string;
    provider: string;
    model: string | null;
    estimatedUsd: number;
    createdAt: string;
    videoProjectId: string | null;
    projectTitle: string | null;
  }[];
  eventCount: number;
  usedFallback: boolean;
  videosCreated: number;
  withAudio: number;
  productionsStarted: number;
  costPerVideo: number | null;
  avgCompletedProjectCost: number | null;
};

const PERIODS: { id: CostPeriod; label: string }[] = [
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "90d", label: "90 dias" },
  { id: "all", label: "Tudo" },
];

const STAGE_ROWS: { key: keyof CostBreakdown; label: string }[] = [
  { key: "ideas", label: "Ideias" },
  { key: "script", label: "Roteiros" },
  { key: "audio", label: "Voz" },
  { key: "music", label: "Música" },
  { key: "sfx", label: "SFX" },
  { key: "transcription", label: "Transcrição/sync" },
  { key: "thumbnail", label: "Portadas" },
  { key: "render", label: "Vídeo / render" },
  { key: "youtube", label: "YouTube upload ($0)" },
];

export function CostsPanel({ channelId }: { channelId: string }) {
  const [period, setPeriod] = useState<CostPeriod>("30d");
  const [data, setData] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: CostPeriod) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/usage?period=${p}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Falha ao carregar custos (HTTP ${res.status})`);
      setData(json as UsageSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    void load(period);
  }, [load, period]);

  return (
    <section className="costs-section">
          <div className="costs-heading">
        <div className="workspace-section-title">
          <h2>Custos de geração</h2>
          <p>
            Estimativa por etapa (ideias, roteiro, áudio, portadas, vídeo), por projeto e por
            período. Upload YouTube = <strong>$0</strong> (só quota diária da API, ~1600
            unidades por vídeo).
          </p>
        </div>
        <div className="costs-period-pills" role="group" aria-label="Período">
          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={period === item.id ? "active" : ""}
              onClick={() => setPeriod(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="generation-error">{error}</div>}
      {loading && !data && <div className="review-empty-state">Carregando custos…</div>}

      {data && (
        <>
          <div className="costs-summary-grid costs-summary-grid-extended">
            <article className="costs-total-card">
              <span className="costs-card-label">Total no período</span>
              <strong className="costs-card-value">{formatUsd(data.totalUsd)}</strong>
              <small>
                {data.eventCount > 0
                  ? `${data.eventCount} evento${data.eventCount === 1 ? "" : "s"} de usage`
                  : data.usedFallback
                    ? "Com base nos custos gravados nos projetos"
                    : "Nenhum gasto registrado neste período"}
              </small>
            </article>
            <article className="costs-stage-card costs-metric-card">
              <span className="costs-card-label">Vídeos criados</span>
              <strong className="costs-card-value">{data.videosCreated}</strong>
              <small>
                produto final · {data.withAudio} com áudio · {data.productionsStarted} produção
                {data.productionsStarted === 1 ? "" : "ões"}
              </small>
            </article>
            <article className="costs-stage-card costs-metric-card">
              <span className="costs-card-label">Custo por vídeo</span>
              <strong className="costs-card-value">
                {data.costPerVideo != null ? formatUsd(data.costPerVideo) : "—"}
              </strong>
              <small>
                {data.videosCreated > 0
                  ? "gasto total ÷ vídeos finalizados (inclui tentativas)"
                  : "nenhum vídeo finalizado neste período"}
              </small>
            </article>
            {STAGE_ROWS.map((row) => {
              const amount = data.byStage[row.key] ?? 0;
              const pct = data.totalUsd > 0 ? Math.round((amount / data.totalUsd) * 100) : 0;
              return (
                <article className="costs-stage-card" key={row.key}>
                  <span className="costs-card-label">{row.label}</span>
                  <strong className="costs-card-value">{formatUsd(amount)}</strong>
                  <div className="costs-bar" aria-hidden>
                    <i style={{ width: `${pct}%` }} />
                  </div>
                  <small>{pct}% do total</small>
                </article>
              );
            })}
          </div>

          <div className="costs-columns">
            <div className="costs-block">
              <h3>Por vídeo / projeto</h3>
              {data.projects.length === 0 ? (
                <div className="review-empty-state">Nenhum projeto neste período.</div>
              ) : (
                <div className="costs-table" role="table">
                  <div className="costs-table-head" role="row">
                    <span>Projeto</span>
                    <span>Ideias</span>
                    <span>Roteiro</span>
                    <span>Áudio</span>
                    <span>Portada</span>
                    <span>Vídeo</span>
                    <span>YT</span>
                    <span>Total</span>
                  </div>
                  {data.projects.map((p) => (
                    <div className="costs-table-row" role="row" key={p.id}>
                      <span className="costs-project-cell">
                        <strong>{p.title}</strong>
                        <small>
                          {new Date(p.createdAt).toLocaleDateString("pt-BR")} · {p.status}
                        </small>
                      </span>
                      <span>{formatUsd(p.breakdown.ideas)}</span>
                      <span>{formatUsd(p.breakdown.script)}</span>
                      <span>{formatUsd(p.breakdown.audio)}</span>
                      <span>{formatUsd(p.breakdown.thumbnail ?? 0)}</span>
                      <span>{formatUsd(p.breakdown.render)}</span>
                      <span>{formatUsd(p.breakdown.youtube ?? 0)}</span>
                      <span className="costs-total-cell">{formatUsd(p.totalUsd)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="costs-side">
              <div className="costs-block">
                <h3>Por provedor</h3>
                {data.byProvider.length === 0 ? (
                  <p className="costs-muted">Sem eventos de provedor neste período.</p>
                ) : (
                  <ul className="costs-provider-list">
                    {data.byProvider.map((row) => (
                      <li key={row.provider}>
                        <span>{row.provider}</span>
                        <span>
                          {formatUsd(row.usd)}
                          <small> · {row.count}×</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="costs-block">
                <h3>Eventos recentes</h3>
                {data.recentEvents.length === 0 ? (
                  <p className="costs-muted">
                    {data.usedFallback
                      ? "Tabela de usage ainda sem eventos — totais vêm dos projetos."
                      : "Nenhum evento neste período."}
                  </p>
                ) : (
                  <ul className="costs-event-list">
                    {data.recentEvents.map((e) => (
                      <li key={e.id}>
                        <div>
                          <strong>{e.stageLabel}</strong>
                          <small>
                            {e.projectTitle ?? e.provider}
                            {e.model ? ` · ${e.model}` : ""}
                          </small>
                        </div>
                        <div className="costs-event-meta">
                          <span>{formatUsd(e.estimatedUsd)}</span>
                          <small>{new Date(e.createdAt).toLocaleString("pt-BR")}</small>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
