"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRightIcon, HomeIcon, PencilIcon } from "../../icons";
import type { ChannelReference, ChannelReferencePlatform, Language } from "../../../core/types";

const LANGUAGES: Array<{ value: Language; label: string }> = [
  { value: "pt", label: "Português" },
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
];

const REFERENCE_PLACEHOLDERS: Record<ChannelReferencePlatform, string> = {
  youtube: "https://www.youtube.com/@exemplo",
  tiktok: "https://www.tiktok.com/@exemplo",
  instagram: "https://www.instagram.com/@exemplo",
  facebook: "https://www.facebook.com/exemplo",
  website: "https://exemplo.com",
};

type UploadKind = "square" | "banner" | "reference";
type FieldErrors = Partial<Record<"name" | "description" | "channelImage", string>>;

function detectReferencePlatform(value: string): ChannelReferencePlatform {
  const raw = value.trim();
  if (!raw) return "website";
  try {
    const hostname = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
    if (hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtu.be") return "youtube";
    if (hostname === "tiktok.com" || hostname.endsWith(".tiktok.com")) return "tiktok";
    if (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) return "instagram";
    if (hostname === "facebook.com" || hostname.endsWith(".facebook.com")) return "facebook";
  } catch {
    // Keep the generic website icon while the user is still typing.
  }
  return "website";
}

function Arrow({ direction = "right" }: { direction?: "left" | "right" }) {
  return <span aria-hidden="true" className={`wizard-arrow wizard-arrow-${direction}`}>→</span>;
}

function UploadGlyph() {
  return (
    <span className="wizard-upload-glyph" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="4" width="17" height="16" rx="2" />
        <circle cx="9" cy="9" r="1.5" />
        <path d="m5.5 17 4.2-4 3.1 2.7 2.6-2.4 3.1 3" />
      </svg>
      <i>+</i>
    </span>
  );
}

function SiteIcon({ platform }: { platform: ChannelReferencePlatform }) {
  if (platform === "youtube") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor"/><path d="m10 9 5 3-5 3Z" fill="#fff"/></svg>;
  }
  if (platform === "tiktok") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 3c.4 2.6 1.8 4 4.5 4.3v3a10 10 0 0 1-4.5-1.4v6.2a6.1 6.1 0 1 1-5.2-6V12a3 3 0 1 0 2 2.8V3Z" fill="currentColor"/></svg>;
  }
  if (platform === "instagram") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>;
  }
  if (platform === "facebook") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M13.7 21v-7h2.4l.4-2.8h-2.8V9.4c0-.8.2-1.4 1.4-1.4h1.5V5.5a19 19 0 0 0-2.2-.1c-2.2 0-3.7 1.3-3.7 3.8v2H8.2V14h2.5v7Z" fill="#fff"/></svg>;
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>;
}

function ImageUpload({
  id,
  kind,
  preview,
  prompt,
  subprompt,
  onChange,
}: {
  id: string;
  kind: UploadKind;
  preview: string | null;
  prompt: string;
  subprompt?: string;
  onChange: (file: File | null, preview: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function chooseFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(file, String(reader.result));
    reader.readAsDataURL(file);
  }

  return (
    <div className={`wizard-upload wizard-upload-${kind}${preview ? " has-preview" : ""}`}>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => chooseFile(event.target.files?.[0])}
      />
      {preview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Prévia da imagem selecionada" />
          <button
            type="button"
            className="wizard-image-remove"
            aria-label="Remover imagem"
            onClick={() => {
              if (inputRef.current) inputRef.current.value = "";
              onChange(null, null);
            }}
          >
            ×
          </button>
          {kind === "reference" && (
            <button type="button" className="wizard-image-change" onClick={() => inputRef.current?.click()}>
              ↻ <span>Trocar imagem</span>
            </button>
          )}
        </>
      ) : (
        <label htmlFor={id}>
          <UploadGlyph />
          <span>{prompt}</span>
          {subprompt && <small>{subprompt}</small>}
        </label>
      )}
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  const labels = ["Informações", "Estilo e conteúdo", "Revisar"];
  return (
    <ol className="channel-stepper" aria-label={`Etapa ${step} de 3`}>
      {labels.map((label, index) => {
        const number = index + 1;
        const done = number < step;
        return (
          <React.Fragment key={label}>
            <li className={number === step ? "active" : done ? "done" : ""}>
              <span>{done ? "✓" : number}</span>
              <small>{label}</small>
            </li>
            {number < labels.length && <i aria-hidden="true"><ChevronRightIcon size={16} /></i>}
          </React.Fragment>
        );
      })}
    </ol>
  );
}

export default function NewChannelPage() {
  const router = useRouter();
  const submittingRef = useRef(false);
  const creationRequestIdRef = useRef<string | null>(null);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [copied, setCopied] = useState(false);

  const [name, setName] = useState("");
  const [language, setLanguage] = useState<Language>("pt");
  const [description, setDescription] = useState("");
  const [channelImage, setChannelImage] = useState<File | null>(null);
  const [channelImagePreview, setChannelImagePreview] = useState<string | null>(null);
  const [channelBanner, setChannelBanner] = useState<File | null>(null);
  const [channelBannerPreview, setChannelBannerPreview] = useState<string | null>(null);
  const [references, setReferences] = useState<ChannelReference[]>([]);

  const [visualReference, setVisualReference] = useState<File | null>(null);
  const [visualReferencePreview, setVisualReferencePreview] = useState<string | null>(null);
  const [visualStyleDescription, setVisualStyleDescription] = useState("");
  const [scriptSkill, setScriptSkill] = useState("");

  const pageCopy = step === 3
    ? {
        title: "Revisar e criar canal",
        subtitle: "Confira todas as informações do seu canal. Se estiver tudo certo, clique em Criar canal para finalizar.",
      }
    : step === 2
      ? {
          title: "Criar novo canal",
          subtitle: "Defina o estilo visual e o skill de roteiro do seu canal. Esses dados serão usados pela IA para criar roteiros, áudios e vídeos com o estilo certo para o seu público.",
        }
      : {
          title: "Criar novo canal",
          subtitle: "Defina as informações iniciais do seu canal. Esses dados serão usados pela IA para gerar roteiros, áudios e vídeos com o estilo certo para o seu público.",
        };

  const skillInstruction = useMemo(() => {
    return `Crie um skill completo de roteiro para o canal “${name || "[nome do canal]"}”.\n\nContexto do canal:\n${description || "[descrição do canal]"}\n\nEstilo visual desejado:\n${visualStyleDescription || "[descreva ou analise a imagem de referência]"}\n\nO skill deve ser escrito em Markdown e incluir: identidade, público, tom, estrutura dos vídeos, regras de abertura, desenvolvimento, encerramento, CTA, linguagem e itens a evitar.`;
  }, [description, name, visualStyleDescription]);

  function validateStepOne() {
    const next: FieldErrors = {};
    if (!name.trim()) next.name = "Informe o nome do canal.";
    if (!description.trim()) next.description = "Descreva o canal.";
    if (!channelImage) next.channelImage = "Adicione a imagem do canal.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function continueFromStepOne() {
    if (!validateStepOne()) return;
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateReference(index: number, url: string) {
    setReferences((current) => current.map((item, itemIndex) => itemIndex === index
      ? { platform: detectReferencePlatform(url), url }
      : item));
  }

  async function copyInstruction() {
    await navigator.clipboard.writeText(skillInstruction);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function createChannelFromReview() {
    // Channel creation is intentionally exclusive to the explicit action on
    // step 3. Form fields can trigger an implicit submit (for example by
    // pressing Enter), so this function must never be used as form.onSubmit.
    if (step !== 3) return;
    if (submittingRef.current) return;
    if (!validateStepOne()) {
      setStep(1);
      return;
    }
    if (!channelImage) return;

    submittingRef.current = true;
    setSaving(true);
    setSubmitError(null);
    try {
      creationRequestIdRef.current ??= crypto.randomUUID();
      const form = new FormData();
      form.append("payload", JSON.stringify({
        creationRequestId: creationRequestIdRef.current,
        name: name.trim(),
        language,
        description: description.trim(),
        referenceLinks: references.filter((reference) => reference.url.trim()),
        visualStyleDescription: visualStyleDescription.trim(),
        scriptSkill: scriptSkill.trim(),
      }));
      form.append("channelImage", channelImage);
      if (channelBanner) form.append("channelBanner", channelBanner);
      if (visualReference) form.append("visualReference", visualReference);

      const response = await fetch("/api/channels", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar o canal.");
      router.replace(`/channels/${data.channel.id}`);
    } catch (error) {
      submittingRef.current = false;
      setSubmitError(error instanceof Error ? error.message : "Não foi possível criar o canal.");
      setSaving(false);
    }
  }

  return (
    <div className="new-channel-wizard">
      <nav className="channel-breadcrumb wizard-breadcrumb" aria-label="Navegação estrutural">
        <Link href="/"><HomeIcon size={17} /> <span>Canais</span></Link>
        <ChevronRightIcon size={17} />
        <strong>Novo canal</strong>
      </nav>

      <header className="wizard-header">
        <div>
          <h1>{pageCopy.title}</h1>
          <p>{pageCopy.subtitle}</p>
        </div>
        <Stepper step={step} />
      </header>

      <form onSubmit={(event) => event.preventDefault()} noValidate>
        {step === 1 && (
          <div className="wizard-stage wizard-stage-one">
            <section className="wizard-card basic-information-card">
              <div className="wizard-card-heading">
                <h2>Informações básicas</h2>
                <p>Defina a identidade e o tema do seu canal.</p>
              </div>

              <div className="wizard-name-row">
                <label className={errors.name ? "has-error" : ""}>
                  <span>Nome do canal</span>
                  <input
                    value={name}
                    maxLength={50}
                    onChange={(event) => {
                      setName(event.target.value);
                      if (errors.name) setErrors((current) => ({ ...current, name: undefined }));
                    }}
                    aria-invalid={Boolean(errors.name)}
                  />
                  <small className="field-counter">{name.length}/50</small>
                  {errors.name && <small className="field-error">{errors.name}</small>}
                </label>
                <label>
                  <span>Idioma principal</span>
                  <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
                    {LANGUAGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
              </div>

              <label className={`wizard-description-field${errors.description ? " has-error" : ""}`}>
                <span>Descrição do canal</span>
                <textarea
                  value={description}
                  maxLength={500}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    if (errors.description) setErrors((current) => ({ ...current, description: undefined }));
                  }}
                  aria-invalid={Boolean(errors.description)}
                />
                <small className="field-counter">{description.length}/500</small>
                {errors.description && <small className="field-error">{errors.description}</small>}
              </label>

              <div className="wizard-media-fields">
                <div className={errors.channelImage ? "has-error" : ""}>
                  <div className="wizard-field-label">
                    <strong>Imagem do canal</strong>
                    <span>Usada como avatar do canal<br />em todas as plataformas.</span>
                  </div>
                  <ImageUpload
                    id="channel-image"
                    kind="square"
                    preview={channelImagePreview}
                    prompt="Adicionar imagem"
                    subprompt="(quadrado)"
                    onChange={(file, preview) => {
                      setChannelImage(file);
                      setChannelImagePreview(preview);
                      if (file) setErrors((current) => ({ ...current, channelImage: undefined }));
                    }}
                  />
                  {errors.channelImage && <small className="field-error upload-error">{errors.channelImage}</small>}
                </div>
                <div>
                  <div className="wizard-field-label">
                    <strong>Capa do canal <em>(opcional)</em></strong>
                    <span>Usada na identidade visual do canal.</span>
                  </div>
                  <ImageUpload
                    id="channel-banner"
                    kind="banner"
                    preview={channelBannerPreview}
                    prompt="Adicionar capa"
                    subprompt="(formato 16:9)"
                    onChange={(file, preview) => {
                      setChannelBanner(file);
                      setChannelBannerPreview(preview);
                    }}
                  />
                </div>
              </div>
            </section>

            <section className="wizard-card reference-links-card">
              <div className="wizard-card-heading">
                <h2>Canais e páginas de referência <em>(opcional)</em></h2>
                <p>Adicione links de canais ou páginas que servem como referência de estilo, narrativa, edição, etc. Pode ser do YouTube, TikTok, Instagram, Facebook ou outros.</p>
              </div>
              <div className="reference-links-list">
                {references.map((reference, index) => (
                  <div className="reference-link-row" key={`${reference.platform}-${index}`}>
                    <span className="reference-link-icon"><SiteIcon platform={reference.platform} /></span>
                    <input
                      type="url"
                      value={reference.url}
                      placeholder={REFERENCE_PLACEHOLDERS[reference.platform]}
                      aria-label={`URL de referência ${index + 1}`}
                      onChange={(event) => updateReference(index, event.target.value)}
                    />
                    <button
                      type="button"
                      aria-label={`Remover referência ${index + 1}`}
                      onClick={() => setReferences((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    >×</button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="add-reference-button"
                onClick={() => setReferences((current) => [...current, { platform: "website", url: "" }])}
              >
                <span>＋</span> Adicionar mais uma referência
              </button>
            </section>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-stage wizard-stage-two">
            <section className="wizard-card visual-reference-card">
              <div className="wizard-card-heading">
                <h2>Imagem de referência visual</h2>
                <p>Envie uma imagem no formato horizontal (16:9) que representa o estilo visual dos vídeos deste canal.</p>
              </div>
              <ImageUpload
                id="visual-reference"
                kind="reference"
                preview={visualReferencePreview}
                prompt="Adicionar imagem de referência"
                subprompt="PNG, JPG ou WebP · formato 16:9"
                onChange={(file, preview) => {
                  setVisualReference(file);
                  setVisualReferencePreview(preview);
                }}
              />
              <label className="visual-description-field">
                <strong>Descrição do estilo visual <span>(detectado pela IA)</span></strong>
                <small>A IA analisa a imagem e identifica os principais elementos do estilo visual. Você pode editar o texto para adicionar mais detalhes ou ajustar as informações.</small>
                <textarea
                  maxLength={2000}
                  value={visualStyleDescription}
                  onChange={(event) => setVisualStyleDescription(event.target.value)}
                  placeholder="Descreva a estética, paleta de cores, iluminação, composição e atmosfera desejadas."
                />
                <i>{visualStyleDescription.length}/2000</i>
              </label>
            </section>

            <section className="wizard-card script-skill-card">
              <div className="copy-instruction-banner">
                <span className="copy-document-icon" aria-hidden="true">▤</span>
                <span>
                  <strong>Copie a instrução para gerar o skill de roteiro na sua IA</strong>
                  <small>Use esta instrução no ChatGPT, Claude, etc, para criar um skill de roteiro completo e personalizado para este canal, com base no estilo visual detectado ao lado.</small>
                </span>
                <button type="button" onClick={copyInstruction}>▣ {copied ? "Copiado!" : "Copiar instrução"}</button>
              </div>
              <div className="script-skill-heading">
                <span>
                  <h2>Skill de roteiro (Script)</h2>
                  <p>Cole aqui todas as instruções, diretrizes e orientações que a IA deve seguir para criar os roteiros e conteúdos deste canal. Pode ser um guia, um template ou qualquer orientação detalhada em formato de texto (Markdown).</p>
                </span>
                <button type="button" onClick={() => setScriptSkill(skillInstruction)}>▣ <span>Modelo</span></button>
              </div>
              <div className="script-editor">
                <span aria-hidden="true">1<br />2<br /><br />3<br />4</span>
                <textarea
                  value={scriptSkill}
                  onChange={(event) => setScriptSkill(event.target.value)}
                  placeholder={`# Cole aqui o skill de roteiro do seu canal...\n\nVocê pode colar o conteúdo gerado pela sua IA (ChatGPT, Claude, etc.)\nEste campo suporta formatação Markdown e textos longos.`}
                  aria-label="Skill de roteiro"
                />
              </div>
            </section>
          </div>
        )}

        {step === 3 && (
          <div className="wizard-stage wizard-stage-three">
            <section className="wizard-card review-basic-card">
              <div className="review-section-heading">
                <h2>Informações básicas</h2>
                <button type="button" onClick={() => setStep(1)}><PencilIcon size={15} /> Editar</button>
              </div>
              <div className="review-profile">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={channelImagePreview ?? ""} alt="Imagem do canal" />
                <div>
                  <h3>{name}</h3>
                  <strong>Idioma principal</strong>
                  <p>{LANGUAGES.find((item) => item.value === language)?.label}</p>
                  <strong>Descrição</strong>
                  <p>{description}</p>
                </div>
              </div>

              <div className="review-divider" />
              <div className="review-section-heading compact">
                <h3>Capa do canal</h3>
                <button type="button" onClick={() => setStep(1)}><PencilIcon size={15} /> Editar</button>
              </div>
              {channelBannerPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="review-banner" src={channelBannerPreview} alt="Capa do canal" />
              ) : <div className="review-empty">Nenhuma capa adicionada</div>}

              <div className="review-divider" />
              <div className="review-section-heading compact">
                <h3>Canais e páginas de referência</h3>
                <button type="button" onClick={() => setStep(1)}><PencilIcon size={15} /> Editar</button>
              </div>
              <div className="review-reference-list">
                {references.filter((reference) => reference.url.trim()).length ? references.filter((reference) => reference.url.trim()).map((reference, index) => (
                  <div key={`${reference.platform}-${index}`}>
                    <span><SiteIcon platform={reference.platform} /></span>
                    <p>{reference.url}</p>
                  </div>
                )) : <div className="review-empty compact-empty">Nenhuma referência adicionada</div>}
              </div>
            </section>

            <div className="review-right-column">
              <section className="wizard-card review-visual-card">
                <div className="review-section-heading">
                  <h2>Estilo visual dos vídeos</h2>
                  <button type="button" onClick={() => setStep(2)}><PencilIcon size={15} /> Editar</button>
                </div>
                <div className="review-visual-content">
                  {visualReferencePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={visualReferencePreview} alt="Referência visual" />
                  ) : <div className="review-visual-placeholder"><UploadGlyph /></div>}
                  <p>{visualStyleDescription || "Nenhuma descrição de estilo visual adicionada."}</p>
                </div>
              </section>

              <section className="wizard-card review-script-card">
                <div className="review-section-heading">
                  <h2>Skill de roteiro (Script)</h2>
                  <button type="button" onClick={() => setStep(2)}><PencilIcon size={15} /> Editar</button>
                </div>
                <div className={`review-script-content${scriptSkill ? "" : " empty"}`}>
                  {scriptSkill || "Nenhum skill de roteiro adicionado. Você poderá preencher este campo depois."}
                </div>
              </section>
            </div>
          </div>
        )}

        {submitError && <div className="wizard-submit-error" role="alert">{submitError}</div>}

        <footer className="wizard-actions">
          {step === 1 ? (
            <Link href="/" className="wizard-secondary-button"><Arrow direction="left" /> Cancelar</Link>
          ) : (
            <button type="button" className="wizard-secondary-button" onClick={() => setStep((current) => current - 1)}>
              <Arrow direction="left" /> Voltar
            </button>
          )}
          {step < 3 ? (
            <button type="button" className="wizard-primary-button" onClick={step === 1 ? continueFromStepOne : () => setStep(3)}>
              Continuar <Arrow />
            </button>
          ) : (
            <button
              type="button"
              className="wizard-primary-button"
              disabled={saving}
              onClick={() => void createChannelFromReview()}
            >
              {saving ? "Criando..." : "Criar canal"} <Arrow />
            </button>
          )}
        </footer>
      </form>
    </div>
  );
}
