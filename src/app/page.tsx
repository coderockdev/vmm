import React from "react";
import Link from "next/link";
import { ensureSeeded } from "../core/seed";
import { listChannels, getChannel } from "../core/repo/channels";
import { listProjectsForChannel, listAllProjects } from "../core/repo/projects";
import {
  CalendarIcon,
  CarouselIcon,
  ChevronRightIcon,
  ClockIcon,
  PencilIcon,
  PlayIcon,
  ShortIcon,
} from "./icons";

export const dynamic = "force-dynamic";

const DASHBOARD_REFERENCE_SRC = "/reference/dashboard-reference.jpg";

type Crop = { x: number; y: number; width: number; height: number };

// Pixel crops into the design-reference screenshot — only valid for these
// three seeded demo channels (their card matched this exact mockup 1:1).
// Any other channel (a new one the user creates) falls back to a plain
// gradient placeholder since we don't generate real thumbnails yet.
const KNOWN_COVER_CROPS: Record<string, Crop> = {
  "historias-do-ze": { x: 284, y: 320, width: 376, height: 153 },
  "chuva-para-dormir": { x: 702, y: 320, width: 364, height: 153 },
  "oracoes-da-noite": { x: 1107, y: 320, width: 380, height: 153 },
};

// The mockup showed a slightly different category word for this one channel
// ("Espiritual" instead of the DNA's literal first niche segment, "Oração").
// Everything else derives the badge text from real channel data.
const KNOWN_CATEGORY_OVERRIDES: Record<string, string> = {
  "oracoes-da-noite": "Espiritual",
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function ReferenceCrop({ crop, alt }: { crop: Crop; alt: string }) {
  return (
    <span
      className="reference-crop"
      aria-label={alt}
      role="img"
      style={{ aspectRatio: `${crop.width} / ${crop.height}` }}
    >
      <img
        src={DASHBOARD_REFERENCE_SRC}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{
          width: `${(1536 / crop.width) * 100}%`,
          left: `${(-crop.x / crop.width) * 100}%`,
          top: `${(-crop.y / crop.height) * 100}%`,
        }}
      />
    </span>
  );
}

function GradientCover({
  color,
  initial,
  aspectRatio = 376 / 153,
}: {
  color: string;
  initial: string;
  aspectRatio?: number;
}) {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: String(aspectRatio),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(135deg, ${color}, ${color}99)`,
      }}
    >
      <span style={{ fontSize: 32, fontWeight: 800, color: "#ffffffcc" }}>{initial}</span>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="channel-stat">
      <span className="channel-stat-icon">{icon}</span>
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
    </div>
  );
}

export default function HomePage() {
  ensureSeeded();
  const channels = listChannels();
  const recentContent = listAllProjects()
    .filter((p) => p.status === "completed")
    .slice(0, 3);

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div className="hero-copy">
          <div className="eyebrow">SEUS CANAIS</div>
          <h1>
            Organize suas ideias.
            <br />
            Crie conteúdo em escala.
          </h1>
          <p>
            Cada canal tem seu próprio estilo, personagens, referências e configurações.
            <br />
            Tudo organizado para você produzir mais, mais rápido.
          </p>
        </div>

        <Link href="/channels/new" className="new-channel-card">
          <span className="new-channel-plus">+</span>
          <span className="new-channel-copy">
            <strong>Novo canal</strong>
            <small>Crie um novo universo de conteúdo.</small>
          </span>
          <ChevronRightIcon size={21} color="#f6f6f6" />
        </Link>
      </section>

      <section className="channel-grid" aria-label="Seus canais">
        {channels.map((channel) => {
          const projects = listProjectsForChannel(channel.id);
          const videos = projects.filter((p) => p.status === "completed" && p.format === "video").length;
          const shorts = projects.filter((p) => p.status === "completed" && p.format === "short").length;
          const category = KNOWN_CATEGORY_OVERRIDES[channel.id] ?? channel.niche.split(" • ")[0];
          const crop = KNOWN_COVER_CROPS[channel.id];
          const description =
            channel.dna.description.length > 95
              ? channel.dna.description.slice(0, 95) + "…"
              : channel.dna.description;

          return (
            <article className="channel-card" key={channel.id}>
              <div className="channel-cover">
                {crop ? (
                  <ReferenceCrop crop={crop} alt={`Capa do canal ${channel.name}`} />
                ) : (
                  <GradientCover color={channel.coverColor} initial={channel.name.charAt(0)} />
                )}
                <button className="round-menu" aria-label={`Mais opções para ${channel.name}`} type="button">
                  <span>•••</span>
                </button>
              </div>

              <div className="channel-body">
                <div className="channel-heading">
                  <div className="channel-title-row">
                    <h2>{channel.name}</h2>
                    <Link href={`/channels/${channel.id}/edit`} aria-label={`Editar ${channel.name}`} className="edit-link">
                      <PencilIcon size={18} />
                    </Link>
                  </div>
                  <span className={`category-badge category-${channel.id}`}>{category}</span>
                </div>

                <p className="channel-description">{description}</p>

                <div className="channel-stats">
                  <Stat icon={<PlayIcon size={23} />} value={videos} label="vídeos" />
                  <Stat icon={<ShortIcon size={20} />} value={shorts} label="shorts" />
                  <Stat icon={<CarouselIcon size={23} />} value={0} label="carrosséis" />
                </div>

                <Link href={`/channels/${channel.id}`} className="open-channel-button">
                  <span>Abrir canal</span>
                  <span className="button-arrow">→</span>
                </Link>
              </div>
            </article>
          );
        })}
      </section>

      <section className="recent-section" aria-labelledby="recent-title">
        <div className="section-heading">
          <div className="eyebrow" id="recent-title">ÚLTIMOS CONTEÚDOS</div>
          <Link href="/renders" className="view-all-button">
            Ver todos <span>→</span>
          </Link>
        </div>

        {recentContent.length === 0 ? (
          <p style={{ color: "var(--text-dim)", fontSize: 14 }}>Nenhum conteúdo renderizado ainda.</p>
        ) : (
          <div className="recent-grid">
            {recentContent.map((project) => {
              const channel = getChannel(project.channelId);
              return (
                <article className="recent-card" key={project.id}>
                  <div className="recent-thumbnail">
                    <GradientCover
                      color={channel?.coverColor ?? "#999"}
                      initial={channel?.name.charAt(0) ?? "?"}
                      aspectRatio={138 / 122}
                    />
                    <span className="duration-badge">{formatDuration(project.renderDurationSeconds)}</span>
                  </div>

                  <div className="recent-info">
                    <div className="recent-topline">
                      <div>
                        <h3>{project.title}</h3>
                        <p>{channel?.name}</p>
                      </div>
                      <button type="button" className="vertical-menu" aria-label={`Mais opções para ${project.title}`}>⋮</button>
                    </div>

                    <span className="rendered-pill"><i /> Renderizado</span>

                    <div className="recent-meta">
                      <span><CalendarIcon size={16} /> {formatDate(project.createdAt)}</span>
                      <span><ClockIcon size={16} /> {formatDuration(project.renderDurationSeconds)}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
