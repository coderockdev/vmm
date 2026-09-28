"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Channel, ContentPlan, VideoProject, VideoFormat, JobStatus } from "../../../core/types";
import { findVoice } from "../../../core/providers/tts/voiceCatalog";
import { TTSProviderName } from "../../../core/providers/tts/TTSProvider";
import { ScriptReviewModal } from "./ScriptReviewModal";
import {
  CalendarIcon,
  CarouselIcon,
  ChevronRightIcon,
  ClockIcon,
  GearIcon,
  HomeIcon,
  PencilIcon,
  PlayIcon,
  ShortIcon,
} from "../../icons";

const CHANNEL_PAGE_REFERENCE_SRC = "/reference/canal-page.png";
const QUANTITIES = [1, 3, 5, 10];
// "script" = script generated, awaiting human review in the Roteiros tab — it
// sits there until a person acts, so it's not part of the auto-poll set.
const ACTIVE_STATUSES: JobStatus[] = ["planned", "audio", "timing", "composing", "rendering"];
type WorkspaceTab = "criar" | "ideias" | "roteiros" | "videos";

type Crop = { x: number; y: number; width: number; height: number };

const SAMPLE_IDEAS = [
  {
    id: "sample-persistencia",
    title: "O valor da persistência",
    angle: "Uma história sobre um jovem que nunca desistiu dos seus sonhos.",
    objective: "Fazer o espectador sentir que vale a pena continuar tentando, mesmo diante de fracassos repetidos.",
  },
  {
    id: "sample-errado",
    title: "Quando tudo dá errado",
    angle: "Uma história sobre um dia em que nada saiu como planejado, mas terminou bem.",
    objective: "Mostrar que contratempos não definem o resultado final do dia — só atrasam ele.",
  },
  {
    id: "sample-cadeira",
    title: "A lição da cadeira vazia",
    angle: "Uma situação simples que ensina um aprendizado incrível sobre a vida.",
    objective: "Levar o espectador a valorizar quem está por perto, antes que seja tarde.",
  },
] as const;

const SAMPLE_VIDEOS = [
  {
    title: "O valor da persistência",
    meta: "12 ago 2024  ·  12.4K visualizações",
    duration: "08:24",
    crop: { x: 270, y: 886, width: 149, height: 82 },
  },
  {
    title: "Noite de chuva na cabana",
    meta: "11 ago 2024  ·  38.2K visualizações",
    duration: "03:12:15",
    crop: { x: 688, y: 886, width: 134, height: 82 },
  },
  {
    title: "Oração da gratidão",
    meta: "10 ago 2024  ·  21.7K visualizações",
    duration: "12:08",
    crop: { x: 1088, y: 886, width: 151, height: 82 },
  },
] as const;

function ReferenceCrop({ crop, alt }: { crop: Crop; alt: string }) {
  return (
    <span className="workspace-reference-crop" role="img" aria-label={alt} style={{ aspectRatio: `${crop.width} / ${crop.height}` }}>
      <img
        src={CHANNEL_PAGE_REFERENCE_SRC}
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

type MiniIconName = "database" | "globe" | "users" | "speaker" | "hash" | "mic" | "video" | "sparkles" | "doc";

function MiniIcon({ name, size = 20 }: { name: MiniIconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9 };
  if (name === "database") return <svg {...common}><ellipse cx="12" cy="5" rx="7.5" ry="3" /><path d="M4.5 5v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V5M4.5 11v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" /></svg>;
  if (name === "globe") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.3 2.5 3.5 5.5 3.5 9S14.3 18.5 12 21M12 3C9.7 5.5 8.5 8.5 8.5 12S9.7 18.5 12 21" /></svg>;
  if (name === "users") return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-2.5c0-2.5 2.4-4.5 5.5-4.5s5.5 2 5.5 4.5V20M15 5.5a3 3 0 0 1 0 5.5M16 13c2.7.4 4.5 2.2 4.5 4.5V20" /></svg>;
  if (name === "speaker") return <svg {...common}><path d="M4 10v4h4l5 4V6l-5 4H4Z" /><path d="M16 9a5 5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></svg>;
  if (name === "hash") return <svg {...common}><path d="M9 3 7 21M17 3l-2 18M4 9h16M3 15h16" /></svg>;
  if (name === "mic") return <svg {...common}><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8 21h8" /></svg>;
  if (name === "video") return <svg {...common}><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></svg>;
  if (name === "doc") return <svg {...common}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></svg>;
  return <svg {...common}><path d="m12 2 1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></svg>;
}

function channelDisplay(channel: Channel) {
  const catalogVoice = channel.dna.voice.voiceId
    ? findVoice(channel.dna.voice.provider as TTSProviderName, channel.dna.voice.voiceId)
    : undefined;
  const voice = !channel.dna.usesNarration
    ? "Sem narração"
    : catalogVoice
      ? `${catalogVoice.name} (${catalogVoice.gender === "feminine" ? "Feminina" : "Masculina"})`
      : `Padrão do provedor (${channel.dna.voice.provider})`;

  return {
    name: channel.name,
    category: channel.niche.split(" • ")[0],
    description: channel.dna.description,
    audience: channel.dna.audience,
    tone: channel.dna.tone.join(", "),
    topics: channel.dna.topics.slice(0, 4).join(", "),
    voice,
    format: channel.dna.usesNarration ? "Vídeo e Short" : "Vídeo ambiente",
  };
}

export function ChannelWorkspace({
  channel,
  initialProjects,
  initialPlans,
}: {
  channel: Channel;
  initialProjects: VideoProject[];
  initialPlans: ContentPlan[];
}) {
  const router = useRouter();
  const display = channelDisplay(channel);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("criar");
  const [topic, setTopic] = useState("");
  const [quantity, setQuantity] = useState(5);
  const [durationKey, setDurationKey] = useState("default");
  const [format, setFormat] = useState<VideoFormat>("video");
  const [ideaAiOverride, setIdeaAiOverride] = useState<"" | "mock" | "anthropic" | "openai" | "gemini">("");
  const [scriptAiOverride, setScriptAiOverride] = useState<"" | "mock" | "anthropic" | "openai" | "gemini">("");
  const [plan, setPlan] = useState<ContentPlan | null>(initialPlans[0] ?? null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set((initialPlans[0]?.items ?? []).filter((item) => item.status === "planned").map((item) => item.id))
  );
  const [sampleSelected, setSampleSelected] = useState<Set<string>>(new Set());
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [ideaError, setIdeaError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [projects, setProjects] = useState<VideoProject[]>(initialProjects);
  const [reviewingProject, setReviewingProject] = useState<VideoProject | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const durationMinutes = durationKey === "default" ? channel.dna.scriptRules.defaultDurationMinutes : Number(durationKey);
  const hasActive = projects.some((project) => ACTIVE_STATUSES.includes(project.status));

  useEffect(() => {
    if (hasActive && !pollRef.current) pollRef.current = setInterval(refreshProjects, 2000);
    if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActive]);

  async function refreshProjects() {
    const response = await fetch(`/api/channels/${channel.id}`);
    const data = await response.json();
    if (data.projects) setProjects(data.projects);
  }

  async function handleGenerateIdeas() {
    if (!topic.trim()) return;
    setLoadingPlan(true);
    setIdeaError(null);
    try {
      const response = await fetch(`/api/channels/${channel.id}/content-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, quantity, durationMinutes, format, aiProviderOverride: ideaAiOverride || null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.plan) {
        throw new Error(data.error ?? `Falha ao gerar ideias (HTTP ${response.status})`);
      }
      setPlan(data.plan);
      setSelectedIds(new Set(data.plan.items.map((item: { id: string }) => item.id)));
      setActiveTab("ideias");
    } catch (err) {
      setIdeaError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingPlan(false);
    }
  }

  async function handleRemoveIdea(ideaId: string) {
    await fetch(`/api/content-ideas/${ideaId}`, { method: "DELETE" });
    setSelectedIds((previous) => {
      const next = new Set(previous);
      next.delete(ideaId);
      return next;
    });
    setPlan((previous) => previous ? {
      ...previous,
      items: previous.items.map((item) => item.id === ideaId ? { ...item, status: "removed" } : item),
    } : previous);
  }

  async function handleGenerateScripts() {
    if (!plan || selectedIds.size === 0) return;
    setGenerating(true);
    setScriptError(null);
    try {
      const response = await fetch(`/api/channels/${channel.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id,
          ideaIds: Array.from(selectedIds),
          aiProviderOverride: scriptAiOverride || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? `Falha ao gerar roteiros (HTTP ${response.status})`);
      await refreshProjects();
      setActiveTab("roteiros");
    } catch (err) {
      setScriptError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(projectId: string) {
    await fetch(`/api/videos/${projectId}`, { method: "DELETE" });
    setProjects((previous) => previous.filter((project) => project.id !== projectId));
  }

  async function handleRegenerate(projectId: string) {
    await fetch(`/api/videos/${projectId}/regenerate`, { method: "POST" });
    await refreshProjects();
  }

  const planIdeas = (plan?.items ?? []).filter((item) => item.status !== "removed");
  const usingSamples = planIdeas.length === 0;
  const visibleIdeas = usingSamples
    ? SAMPLE_IDEAS
    : planIdeas.map((item) => ({ id: item.id, title: item.title, angle: item.angle, objective: item.objective }));
  const activeSelection = usingSamples ? sampleSelected : selectedIds;
  const allSelected = visibleIdeas.length > 0 && visibleIdeas.every((idea) => activeSelection.has(idea.id));

  const reviewProjects = projects.filter((p) => p.status === "script");
  const videoProjects = projects.filter((p) => p.status !== "script");

  function toggleIdea(id: string, checked: boolean) {
    const setter = usingSamples ? setSampleSelected : setSelectedIds;
    setter((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    const setter = usingSamples ? setSampleSelected : setSelectedIds;
    setter(checked ? new Set(visibleIdeas.map((idea) => idea.id)) : new Set());
  }

  return (
    <div className="channel-workspace">
      <nav className="channel-breadcrumb" aria-label="Navegação estrutural">
        <Link href="/"><HomeIcon size={16} /> <span>Canais</span></Link>
        <ChevronRightIcon size={16} />
        <strong>{display.name}</strong>
      </nav>

      <header className="channel-profile-header">
        <div className="channel-profile-main">
          <div className="channel-profile-cover">
            <ReferenceCrop crop={{ x: 254, y: 56, width: 167, height: 133 }} alt={`Capa de ${display.name}`} />
            <Link href={`/channels/${channel.id}/edit`} className="cover-edit-button" aria-label="Editar capa">
              <PencilIcon size={16} />
            </Link>
          </div>
          <div className="channel-profile-copy">
            <div className="channel-name-line">
              <h1>{display.name}</h1>
              <Link href={`/channels/${channel.id}/edit`} aria-label="Editar nome do canal"><PencilIcon size={18} /></Link>
            </div>
            <span className="workspace-category">{display.category}</span>
            <p>{display.description}</p>
          </div>
        </div>

        <aside className="channel-dna-card">
          <div className="dna-card-copy">
            <span className="dna-icon"><MiniIcon name="database" size={24} /></span>
            <span>
              <strong>DNA do canal</strong>
              <small>Contexto, estilo, tom, público, temas e<br /> configurações do canal para geração de conteúdo.</small>
            </span>
          </div>
          <Link href={`/channels/${channel.id}/edit`} className="dna-edit-button"><GearIcon size={19} /> Editar DNA do canal</Link>
        </aside>
      </header>

      <nav className="workspace-tabs" aria-label="Seções do canal">
        <button type="button" className={activeTab === "criar" ? "active" : ""} onClick={() => setActiveTab("criar")}>Criar conteúdo</button>
        <button type="button" className={activeTab === "ideias" ? "active" : ""} onClick={() => setActiveTab("ideias")}>Ideias</button>
        <button type="button" className={activeTab === "roteiros" ? "active" : ""} onClick={() => setActiveTab("roteiros")}>
          Roteiros{reviewProjects.length > 0 && <span className="tab-badge">{reviewProjects.length}</span>}
        </button>
        <button type="button" className={activeTab === "videos" ? "active" : ""} onClick={() => setActiveTab("videos")}>Vídeos</button>
        <button type="button" disabled title="Ainda não implementado">Estatísticas</button>
        <button type="button" onClick={() => router.push(`/channels/${channel.id}/edit`)}>Configurações</button>
      </nav>

      {activeTab === "criar" && (
        <div className="creation-layout">
          <section className="creation-card">
            <div className="workspace-section-title">
              <h2>O que vamos criar hoje?</h2>
              <p>Digite um assunto e gere várias ideias de vídeos com base no DNA deste canal.</p>
            </div>
            <div className="topic-field">
              <textarea
                value={topic}
                maxLength={500}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="Ex.: Uma história sobre persistência e nunca desistir dos sonhos..."
                aria-label="Assunto para geração de ideias"
              />
              <span>{topic.length}/500</span>
            </div>

            <div className="creation-controls">
              <label>
                <span>Quantidade de vídeos</span>
                <select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))}>
                  {QUANTITIES.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                <span>Duração por vídeo</span>
                <select value={durationKey} onChange={(event) => setDurationKey(event.target.value)}>
                  <option value="default">{channel.dna.scriptRules.defaultDurationMinutes} minutos</option>
                  <option value="5">5 minutos</option>
                  <option value="10">10 minutos</option>
                  <option value="15">15 minutos</option>
                </select>
              </label>
              <div className="format-control">
                <span>Formato</span>
                <div>
                  <button type="button" className={format === "video" ? "active" : ""} onClick={() => setFormat("video")}><PlayIcon size={18} /> Vídeo</button>
                  <button type="button" className={format === "short" ? "active" : ""} onClick={() => setFormat("short")}><ShortIcon size={15} /> Short</button>
                  <button type="button" className={format === "both" ? "active" : ""} onClick={() => setFormat("both")}><CarouselIcon size={18} /> Vídeo + Short</button>
                </div>
              </div>
              <button type="button" className="generate-ideas-button" disabled={loadingPlan || !topic.trim()} onClick={handleGenerateIdeas}>
                <MiniIcon name="sparkles" size={22} />
                {loadingPlan ? "Gerando ideias..." : "Gerar ideias de vídeos"}
              </button>
            </div>
            {ideaError && <div className="generation-error">{ideaError}</div>}

            <div className="voice-row">
              <MiniIcon name="sparkles" size={24} />
              <span className="voice-label">IA para gerar as ideias</span>
              <select value={ideaAiOverride} onChange={(event) => setIdeaAiOverride(event.target.value as typeof ideaAiOverride)}>
                <option value="">Padrão do sistema (AI_PROVIDER)</option>
                <option value="mock">Mock (sem IA, offline)</option>
                <option value="anthropic">Claude (Anthropic)</option>
                <option value="openai">ChatGPT (OpenAI)</option>
                <option value="gemini">Gemini (Google)</option>
              </select>
              <label className="voice-toggle-label">
                <span>Usar outra IA apenas nesta geração</span>
                <input type="checkbox" checked={Boolean(ideaAiOverride)} onChange={(event) => setIdeaAiOverride(event.target.checked ? "anthropic" : "")} />
                <i />
              </label>
            </div>
          </section>

          <aside className="channel-summary-card">
            <div className="summary-heading">
              <h2>Resumo do canal</h2>
              <Link href={`/channels/${channel.id}/edit`}>Ver detalhes <span>→</span></Link>
            </div>
            <div className="summary-list">
              <div className="summary-row"><div className="summary-key"><MiniIcon name="globe" /><span>Idioma</span></div><div className="summary-value">Português</div></div>
              <div className="summary-row"><div className="summary-key"><MiniIcon name="users" /><span>Público</span></div><div className="summary-value">{display.audience}</div></div>
              <div className="summary-row"><div className="summary-key"><MiniIcon name="speaker" /><span>Tom</span></div><div className="summary-value">{display.tone}</div></div>
              <div className="summary-row"><div className="summary-key"><MiniIcon name="hash" /><span>Temas principais</span></div><div className="summary-value">{display.topics}</div></div>
              <div className="summary-row"><div className="summary-key"><ClockIcon size={20} /><span>Duração padrão</span></div><div className="summary-value">{channel.dna.scriptRules.defaultDurationMinutes} minutos</div></div>
              <div className="summary-row"><div className="summary-key"><MiniIcon name="mic" /><span>Voz padrão</span></div><div className="summary-value">{display.voice}</div></div>
              <div className="summary-row"><div className="summary-key"><MiniIcon name="video" /><span>Formato preferido</span></div><div className="summary-value">{display.format}</div></div>
            </div>
          </aside>
        </div>
      )}

      {activeTab === "ideias" && (
        <section className="suggested-ideas-section">
          <div className="ideas-heading">
            <div className="workspace-section-title">
              <h2>Ideias de vídeos sugeridas</h2>
              <p>Selecione as ideias que quer transformar em roteiro e escolha qual IA vai escrever.</p>
            </div>
            <div className="ideas-actions">
              <label className="select-all"><input type="checkbox" checked={allSelected} onChange={(event) => toggleAll(event.target.checked)} /> <span>Selecionar todos</span></label>
              <select
                className="ideas-ai-select"
                value={scriptAiOverride}
                onChange={(event) => setScriptAiOverride(event.target.value as typeof scriptAiOverride)}
                aria-label="IA para gerar o roteiro"
              >
                <option value="">IA do roteiro: padrão do sistema</option>
                <option value="mock">IA do roteiro: Mock</option>
                <option value="anthropic">IA do roteiro: Claude</option>
                <option value="openai">IA do roteiro: ChatGPT</option>
                <option value="gemini">IA do roteiro: Gemini</option>
              </select>
              <button type="button" disabled={usingSamples || selectedIds.size === 0 || generating} onClick={handleGenerateScripts}>
                {generating ? "Enviando para revisão..." : "Gerar roteiros selecionados"} <span>→</span>
              </button>
            </div>
          </div>
          {scriptError && <div className="generation-error">{scriptError}</div>}

          <div className="ideas-grid">
            {visibleIdeas.map((idea) => (
              <article className="idea-card" key={idea.id}>
                <input
                  className="idea-checkbox"
                  type="checkbox"
                  checked={activeSelection.has(idea.id)}
                  onChange={(event) => toggleIdea(idea.id, event.target.checked)}
                  aria-label={`Selecionar ${idea.title}`}
                />
                <div className="idea-copy">
                  <h3>{idea.title}</h3>
                  <p className="idea-angle">{idea.angle}</p>
                  {idea.objective && <p className="idea-objective">{idea.objective}</p>}
                </div>
                {!usingSamples && <button type="button" className="idea-remove" onClick={() => handleRemoveIdea(idea.id)} aria-label={`Remover ${idea.title}`}>×</button>}
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === "roteiros" && (
        <section className="review-queue-section">
          <div className="workspace-section-title">
            <h2>Roteiros aguardando revisão</h2>
            <p>Leia cada roteiro, aprove escolhendo a voz, peça outra versão ou exclua.</p>
          </div>

          {reviewProjects.length === 0 ? (
            <div className="review-empty-state">
              Nenhum roteiro aguardando revisão. Gere roteiros na aba <button type="button" onClick={() => setActiveTab("ideias")}>Ideias</button>.
            </div>
          ) : (
            <div className="review-queue-list">
              {reviewProjects.map((project) => (
                <article className="review-queue-card" key={project.id}>
                  <div className="review-queue-icon"><MiniIcon name="doc" size={22} /></div>
                  <div className="review-queue-copy">
                    <h3>{project.title}</h3>
                    <p>{project.topic} · {project.durationMinutes} min · {project.format}</p>
                  </div>
                  <button type="button" onClick={() => setReviewingProject(project)}>Ler e revisar</button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "videos" && (
        <section className="channel-videos-section" id="channel-videos">
          <div className="videos-heading">
            <h2>Últimos vídeos do canal</h2>
            <Link href="/renders">Ver todos <span>→</span></Link>
          </div>
          <div className="workspace-videos-grid">
            {videoProjects.length === 0
              ? SAMPLE_VIDEOS.map((video) => <StaticVideoCard key={video.title} video={video} />)
              : videoProjects.slice(0, 6).map((project, index) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    crop={SAMPLE_VIDEOS[index % SAMPLE_VIDEOS.length].crop}
                    channel={channel}
                    onDelete={handleDelete}
                    onRegenerate={handleRegenerate}
                  />
                ))}
          </div>
        </section>
      )}

      {reviewingProject && (
        <ScriptReviewModal
          project={reviewingProject}
          channel={channel}
          onClose={() => setReviewingProject(null)}
          onApproved={(updated) => {
            setProjects((previous) => previous.map((p) => (p.id === updated.id ? updated : p)));
            setReviewingProject(null);
            setActiveTab("videos");
          }}
          onDeleted={(projectId) => {
            setProjects((previous) => previous.filter((p) => p.id !== projectId));
            setReviewingProject(null);
          }}
        />
      )}
    </div>
  );
}

function StaticVideoCard({ video }: { video: typeof SAMPLE_VIDEOS[number] }) {
  return (
    <article className="workspace-video-card">
      <div className="workspace-video-thumb">
        <ReferenceCrop crop={video.crop} alt={`Miniatura de ${video.title}`} />
        <span>{video.duration}</span>
      </div>
      <div className="workspace-video-copy">
        <h3>{video.title}</h3>
        <p>{video.meta}</p>
        <span className="workspace-rendered"><i /> Renderizado</span>
      </div>
      <button type="button" className="workspace-video-menu" aria-label={`Mais opções para ${video.title}`}>⋮</button>
    </article>
  );
}

function ProjectRow({
  project,
  crop,
  channel,
  onDelete,
  onRegenerate,
}: {
  project: VideoProject;
  crop: Crop;
  channel: Channel;
  onDelete: (id: string) => void;
  onRegenerate: (id: string) => void;
}) {
  const isComplete = project.status === "completed";
  return (
    <article className="workspace-video-card">
      <div className="workspace-video-thumb">
        <ReferenceCrop crop={crop} alt={`Miniatura de ${project.title}`} />
        <span>{project.renderDurationSeconds ? formatDuration(project.renderDurationSeconds) : `${project.durationMinutes}:00`}</span>
      </div>
      <div className="workspace-video-copy">
        <h3>{project.title}</h3>
        <p>{new Date(project.createdAt).toLocaleDateString("pt-BR")} · {channel.name}</p>
        <span className={`workspace-rendered${project.status === "failed" ? " failed" : ""}`}><i /> {isComplete ? "Renderizado" : project.status === "failed" ? "Falhou" : "Em produção"}</span>
      </div>
      <details className="project-actions">
        <summary aria-label={`Mais opções para ${project.title}`}>⋮</summary>
        <div>
          <button type="button" onClick={() => onRegenerate(project.id)}>Gerar novamente</button>
          <button type="button" onClick={() => onDelete(project.id)}>Excluir</button>
        </div>
      </details>
    </article>
  );
}

function formatDuration(seconds: number) {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}
