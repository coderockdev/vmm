"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { OutputMark } from "./ChannelSubjectGenerator";

export interface ChannelProductionItem {
  id: string;
  title: string;
  createdAt: string;
  status: string;
  format: "video" | "short" | "both";
  thumbnailUrl: string;
  durationSeconds: number | null;
}

type Filter = "ready" | "pending" | "working" | "all";

const WORKING_STATUSES = new Set(["audio", "timing", "composing", "rendering"]);

function isPending(status: string) {
  return status === "planned" || status === "script";
}

function statusLabel(status: string) {
  if (status === "completed") return "Pronto";
  if (status === "failed") return "Falhou";
  if (WORKING_STATUSES.has(status)) return "Em produção";
  if (status === "script") return "Roteiro pendente";
  return "Pendente";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return null;
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function ChannelProductions({
  channelId,
  items,
}: {
  channelId: string;
  items: ChannelProductionItem[];
}) {
  const [filter, setFilter] = useState<Filter>("ready");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "oldest">("recent");

  const counts = useMemo(() => ({
    ready: items.filter((item) => item.status === "completed").length,
    pending: items.filter((item) => isPending(item.status)).length,
    working: items.filter((item) => WORKING_STATUSES.has(item.status)).length,
    all: items.length,
  }), [items]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    return items
      .filter((item) => {
        const matchesFilter = filter === "all"
          || (filter === "ready" && item.status === "completed")
          || (filter === "pending" && isPending(item.status))
          || (filter === "working" && WORKING_STATUSES.has(item.status));
        return matchesFilter && (!normalizedQuery || item.title.toLocaleLowerCase("pt-BR").includes(normalizedQuery));
      })
      .sort((left, right) => {
        const difference = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        return sort === "recent" ? -difference : difference;
      });
  }, [filter, items, query, sort]);

  return (
    <section className="channel-view-productions" aria-labelledby="channel-view-productions-title">
      <div className="channel-view-productions-heading">
        <h2 id="channel-view-productions-title">Produções recentes</h2>
        <div className="channel-view-production-filters" role="tablist" aria-label="Filtrar produções">
          <button type="button" role="tab" aria-selected={filter === "ready"} className={filter === "ready" ? "selected" : ""} onClick={() => setFilter("ready")}>Vídeos prontos <small>{counts.ready}</small></button>
          <button type="button" role="tab" aria-selected={filter === "pending"} className={filter === "pending" ? "selected" : ""} onClick={() => setFilter("pending")}>Pendentes <small>{counts.pending}</small></button>
          <button type="button" role="tab" aria-selected={filter === "working"} className={filter === "working" ? "selected" : ""} onClick={() => setFilter("working")}>Em produção <small>{counts.working}</small></button>
          <button type="button" role="tab" aria-selected={filter === "all"} className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>Todos <small>{counts.all}</small></button>
        </div>
        <div className="channel-view-production-tools">
          <label className="channel-view-search">
            <span className="sr-only">Buscar vídeos</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar vídeos..." />
          </label>
          <label className="channel-view-sort">
            <span className="sr-only">Ordenar produções</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
              <option value="recent">Mais recentes</option>
              <option value="oldest">Mais antigas</option>
            </select>
          </label>
        </div>
      </div>

      {visibleItems.length > 0 ? (
        <div className="channel-view-project-grid">
          {visibleItems.map((project) => {
            const duration = formatDuration(project.durationSeconds);
            return (
              <Link className="channel-view-project-card" href={`/channels/${channelId}`} key={project.id}>
                <div className="channel-view-project-image">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={project.thumbnailUrl} alt={`Imagem de ${project.title}`} loading="lazy" />
                  <span className="channel-view-project-platforms">
                    {(project.format === "video" || project.format === "both") && (
                      <span className="channel-view-platform-badge"><OutputMark format="video" /> YouTube</span>
                    )}
                    {(project.format === "short" || project.format === "both") && (
                      <span className="channel-view-platform-badge"><OutputMark format="short" /> Shorts</span>
                    )}
                  </span>
                  {duration && <span className="channel-view-project-duration">{duration}</span>}
                </div>
                <h3>{project.title}</h3>
                <span className={`channel-view-project-status status-${project.status}`}>{statusLabel(project.status)}</span>
                <time dateTime={project.createdAt}>{formatDate(project.createdAt)}</time>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="channel-view-empty">{items.length === 0 ? "Ainda não há produções com imagens neste canal." : "Nenhuma produção corresponde a este filtro."}</p>
      )}
    </section>
  );
}
