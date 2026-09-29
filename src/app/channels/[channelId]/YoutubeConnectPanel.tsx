"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

type AccountInfo = {
  youtubeChannelId: string;
  title: string;
  connectedAt: string;
  scopes: string;
};

type Status = {
  configured: boolean;
  oauthReady: boolean;
  encryptionReady: boolean;
  expectedYoutubeChannelId: string | null;
  expectedHandle: string | null;
  channelMismatch: boolean;
  account: AccountInfo | null;
};

const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB — streamed, never whole file in RAM as one blob upload

export function YoutubeConnectPanel({
  channelId,
  channelName,
}: {
  channelId: string;
  channelName: string;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<string | null>(null);
  const [lastVideoId, setLastVideoId] = useState<string | null>(null);
  const [thumbWarning, setThumbWarning] = useState<string | null>(null);
  const [resumeUploadId, setResumeUploadId] = useState<string | null>(null);
  const abortRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/youtube`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setStatus(json as Status);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const yt = params.get("yt");
    if (!yt) return;
    if (yt === "connected") setFlash("YouTube conectado com sucesso.");
    else if (yt === "denied") setFlash(`Autorização recusada: ${params.get("reason") || "denied"}`);
    else if (yt === "error") setFlash(`Falha OAuth: ${params.get("reason") || "erro"}`);
    const url = new URL(window.location.href);
    url.searchParams.delete("yt");
    url.searchParams.delete("reason");
    window.history.replaceState({}, "", url.pathname + url.search);
    void load();
  }, [load]);

  async function disconnect() {
    if (!confirm(`Desligar a conta YouTube de «${channelName}»?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/youtube`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setFlash("Conta YouTube desligada.");
      setLastVideoId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function explainApiError(json: { error?: string; code?: string }, fallback: string) {
    if (json.code === "invalid_grant") {
      return json.error || "Token expirado/revogado — volta a Conectar YouTube.";
    }
    if (json.code === "quotaExceeded") {
      return json.error || "Quota diária da API YouTube esgotada.";
    }
    return json.error || fallback;
  }

  async function uploadThumbnailOnly(videoId: string, file: File) {
    setUploadPhase("A enviar capa…");
    const form = new FormData();
    form.set("videoId", videoId);
    form.set("thumbnail", file);
    const res = await fetch(`/api/channels/${channelId}/youtube/thumbnail`, {
      method: "POST",
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = explainApiError(json, "Falha na capa");
      setThumbWarning(
        `${msg} O vídeo já está no YouTube — podes tentar só a capa outra vez. ` +
          `(Canal sem verificação por telefone também bloqueia capas personalizadas.)`
      );
      return false;
    }
    setThumbWarning(null);
    return true;
  }

  async function runUpload(opts?: { resumeId?: string | null }) {
    if (!videoFile) {
      setError("Escolhe um ficheiro de vídeo.");
      return;
    }
    const cleanTitle = title.replace(/[<>]/g, "").trim();
    if (!cleanTitle) {
      setError("Título obrigatório (sem < nem >).");
      return;
    }
    if (cleanTitle.length > 100) {
      setError("Título: máximo 100 caracteres.");
      return;
    }
    if (thumbFile) {
      if (!["image/jpeg", "image/png", "image/jpg"].includes(thumbFile.type)) {
        setError("Capa: só JPG ou PNG.");
        return;
      }
      if (thumbFile.size > 2 * 1024 * 1024) {
        setError("Capa: máximo 2 MB.");
        return;
      }
    }

    abortRef.current = false;
    setBusy(true);
    setError(null);
    setFlash(null);
    setThumbWarning(null);
    setUploadPct(0);
    setLastVideoId(null);

    try {
      let uploadId = opts?.resumeId ?? resumeUploadId;
      let startAt = 0;
      const total = videoFile.size;
      const contentType = videoFile.type || "video/mp4";

      if (uploadId) {
        setUploadPhase("A retomar upload…");
        const st = await fetch(
          `/api/channels/${channelId}/youtube/upload/session?uploadId=${encodeURIComponent(uploadId)}`
        );
        const stJson = await st.json().catch(() => ({}));
        if (st.ok && stJson.videoId) {
          setLastVideoId(stJson.videoId);
          setUploadPct(100);
          if (thumbFile) await uploadThumbnailOnly(stJson.videoId, thumbFile);
          setFlash("Upload já estava completo.");
          setResumeUploadId(null);
          return;
        }
        if (st.ok && typeof stJson.bytesReceived === "number") {
          startAt = stJson.bytesReceived;
        } else {
          // Session gone — start fresh
          uploadId = null;
          startAt = 0;
        }
      }

      if (!uploadId) {
        setUploadPhase("A iniciar sessão resumable…");
        const init = await fetch(`/api/channels/${channelId}/youtube/upload/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: cleanTitle,
            description,
            contentType,
            contentLength: total,
          }),
        });
        const initJson = await init.json().catch(() => ({}));
        if (!init.ok) throw new Error(explainApiError(initJson, "Falha ao iniciar upload"));
        uploadId = String(initJson.uploadId);
        setResumeUploadId(uploadId);
        startAt = 0;
      }

      setUploadPhase("A enviar vídeo…");
      let offset = startAt;
      let videoId: string | null = null;

      while (offset < total) {
        if (abortRef.current) throw new Error("Upload cancelado.");
        const end = Math.min(offset + CHUNK_SIZE, total) - 1;
        const blob = videoFile.slice(offset, end + 1);
        const buf = await blob.arrayBuffer();

        const res = await fetch(
          `/api/channels/${channelId}/youtube/upload/chunk?uploadId=${encodeURIComponent(uploadId!)}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": contentType,
              "Content-Range": `bytes ${offset}-${end}/${total}`,
            },
            body: buf,
          }
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(explainApiError(json, "Falha no chunk"));

        offset = typeof json.bytesReceived === "number" ? json.bytesReceived : end + 1;
        setUploadPct(Math.min(99, Math.round((offset / total) * 100)));
        if (json.done && json.videoId) {
          videoId = json.videoId;
          break;
        }
      }

      if (!videoId) {
        // Final status check
        const st = await fetch(
          `/api/channels/${channelId}/youtube/upload/session?uploadId=${encodeURIComponent(uploadId!)}`
        );
        const stJson = await st.json().catch(() => ({}));
        videoId = stJson.videoId || null;
      }

      if (!videoId) throw new Error("Upload terminou sem videoId.");

      setLastVideoId(videoId);
      setUploadPct(100);
      setResumeUploadId(null);

      if (thumbFile) {
        const ok = await uploadThumbnailOnly(videoId, thumbFile);
        if (ok) setFlash("Vídeo + capa enviados (privado). Conclui classificações no Studio.");
        else setFlash("Vídeo enviado (privado). Capa falhou — vê o aviso abaixo.");
      } else {
        setFlash("Vídeo enviado como privado. Conclui classificações no Studio.");
      }
      setUploadPhase(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setUploadPhase(null);
      if (/revogado|Conectar YouTube|invalid_grant/i.test(message)) {
        setFlash("Precisas de voltar a ligar a conta YouTube.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="books-muted">A verificar ligação YouTube…</p>;
  }

  const connected = Boolean(status?.account);
  const studioVideoUrl = lastVideoId
    ? `https://studio.youtube.com/video/${lastVideoId}/edit`
    : null;

  return (
    <div className="youtube-connect-panel">
      <div className="workspace-section-title">
        <h2>YouTube</h2>
        <p>
          Liga a conta Google deste canal. Com a conta ligada, o botão{" "}
          <strong>Automático</strong> em Criar conteúdo faz sozinho: título, roteiro, áudio,
          música, SFX, vídeo, descrição, portada e <strong>upload privado</strong> para este
          YouTube. O formulário abaixo é só para um ficheiro avulso.
        </p>
      </div>

      <div className="audiobook-voice-card">
        {!status?.oauthReady && (
          <p className="generation-error">
            Falta OAuth no servidor: <code>YOUTUBE_CLIENT_ID</code> /{" "}
            <code>YOUTUBE_CLIENT_SECRET</code> (ou <code>YOUTUBE_OAUTH_*</code>) no{" "}
            <code>.env.local</code>.
          </p>
        )}
        {status?.oauthReady && !status.encryptionReady && (
          <p className="generation-error">
            Falta <code>APP_ENCRYPTION_KEY</code> (
            <code>openssl rand -base64 32</code>).
          </p>
        )}

        {status?.account ? (
          <>
            <p>
              Ligado a <strong>{status.account.title}</strong>
              {status.expectedHandle ? (
                <>
                  {" "}
                  (<code>{status.expectedHandle}</code>)
                </>
              ) : null}
              <br />
              <span className="books-muted">
                ID {status.account.youtubeChannelId} · desde{" "}
                {new Date(status.account.connectedAt).toLocaleString("pt-BR")}
              </span>
            </p>
            {status.channelMismatch && status.expectedYoutubeChannelId && (
              <p className="generation-error">
                Este não parece o canal Amor Amor esperado (
                <code>{status.expectedHandle || status.expectedYoutubeChannelId}</code>). Desliga e
                volta a conectar com a conta Google certa — uploads estão bloqueados até isso.
              </p>
            )}
            <div className="portadas-actions">
              <a
                className="review-queue-action"
                href={`https://studio.youtube.com/channel/${status.account.youtubeChannelId}`}
                target="_blank"
                rel="noreferrer"
              >
                Abrir YouTube Studio
              </a>
              <button type="button" disabled={busy} onClick={() => void disconnect()}>
                Desligar
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="books-muted">
              {channelId === "amor-amor" ? (
                <>
                  Ainda sem conta. Conecta com a Google de{" "}
                  <strong>Amor Amor (@amoramor333)</strong> — outra conta é rejeitada.
                </>
              ) : (
                <>Ainda sem conta. Conecta com a Google que gere o canal (admin/editor).</>
              )}
            </p>
            <div className="portadas-actions">
              <a
                className="books-import-btn"
                href={
                  status?.configured
                    ? `/api/youtube/oauth/start?channelId=${encodeURIComponent(channelId)}`
                    : undefined
                }
                aria-disabled={!status?.configured}
                style={!status?.configured ? { pointerEvents: "none", opacity: 0.5 } : undefined}
              >
                Conectar YouTube
              </a>
            </div>
          </>
        )}

        {flash && <p className="books-ok">{flash}</p>}
        {error && <p className="generation-error">{error}</p>}
      </div>

      {connected && (
        <div className="audiobook-voice-card youtube-upload-card">
          <h3>Upload manual (opcional)</h3>
          <p className="books-muted">
            O fluxo normal é <strong>Criar → Automático</strong> (já sobe título, vídeo e capa).
            Usa isto só se tens um MP4 à parte.
          </p>

          <label className="portadas-label">
            Título (máx. 100)
            <input
              value={title}
              maxLength={100}
              disabled={busy}
              onChange={(e) => setTitle(e.target.value.replace(/[<>]/g, ""))}
              placeholder="Título do vídeo"
            />
          </label>

          <label className="portadas-label">
            Descrição
            <textarea
              value={description}
              disabled={busy}
              rows={4}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição (opcional)"
            />
          </label>

          <label className="portadas-label">
            Ficheiro de vídeo
            <input
              type="file"
              accept="video/*"
              disabled={busy}
              onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <label className="portadas-label">
            Capa (JPG/PNG, máx. 2 MB, ideal 1280×720)
            <input
              type="file"
              accept="image/jpeg,image/png"
              disabled={busy}
              onChange={(e) => setThumbFile(e.target.files?.[0] ?? null)}
            />
          </label>

          {(busy || uploadPct > 0) && (
            <div className="youtube-upload-progress" role="status">
              <div className="youtube-upload-bar">
                <i style={{ width: `${uploadPct}%` }} />
              </div>
              <span>
                {uploadPhase || "Upload"} · {uploadPct}%
              </span>
            </div>
          )}

          <div className="portadas-actions">
            <button
              type="button"
              className="books-import-btn"
              disabled={busy || !status?.account}
              onClick={() => void runUpload()}
            >
              {busy ? "A enviar…" : "Enviar para YouTube"}
            </button>
            {resumeUploadId && !busy && (
              <button type="button" onClick={() => void runUpload({ resumeId: resumeUploadId })}>
                Retomar upload
              </button>
            )}
            {busy && (
              <button
                type="button"
                onClick={() => {
                  abortRef.current = true;
                }}
              >
                Cancelar
              </button>
            )}
            {lastVideoId && thumbFile && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void (async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      const ok = await uploadThumbnailOnly(lastVideoId, thumbFile);
                      if (ok) setFlash("Capa atualizada.");
                    } catch (err) {
                      setError(err instanceof Error ? err.message : String(err));
                    } finally {
                      setBusy(false);
                      setUploadPhase(null);
                    }
                  })()
                }
              >
                Tentar só a capa
              </button>
            )}
          </div>

          {thumbWarning && <p className="generation-error">{thumbWarning}</p>}

          {studioVideoUrl && (
            <p className="books-ok">
              Pronto —{" "}
              <a href={studioVideoUrl} target="_blank" rel="noreferrer">
                abrir no YouTube Studio
              </a>{" "}
              para classificações (público, tags, etc.).
            </p>
          )}
        </div>
      )}

      <details className="audiobook-sample-text">
        <summary>Checklist Google Cloud</summary>
        <ol className="youtube-setup-list">
          <li>YouTube Data API v3 ativa</li>
          <li>
            OAuth Web + redirect{" "}
            <code>http://localhost:3000/api/youtube/oauth/callback</code>
          </li>
          <li>
            Env: <code>YOUTUBE_CLIENT_ID</code>, <code>YOUTUBE_CLIENT_SECRET</code>,{" "}
            <code>APP_ENCRYPTION_KEY</code>
          </li>
          <li>Reiniciar dev server após mudar o .env</li>
        </ol>
      </details>
    </div>
  );
}
