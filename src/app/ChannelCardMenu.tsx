"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function ChannelCardMenu({ channelId, channelName }: { channelId: string; channelName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  async function handleRename() {
    setOpen(false);
    const newName = window.prompt("Novo nome do canal:", channelName);
    if (!newName || !newName.trim() || newName.trim() === channelName) return;

    setBusy(true);
    try {
      const response = await fetch(`/api/channels/${channelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Falha ao renomear o canal");
      }
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setOpen(false);
    const confirmed = window.confirm(
      `Excluir o canal "${channelName}"? Isso apaga também todas as ideias, roteiros e vídeos dele. Essa ação não pode ser desfeita.`
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const response = await fetch(`/api/channels/${channelId}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Falha ao excluir o canal");
      }
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="channel-menu-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className="round-menu"
        aria-label={`Mais opções para ${channelName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
        disabled={busy}
      >
        <span>•••</span>
      </button>
      {open && (
        <div className="channel-menu-dropdown" role="menu">
          <button type="button" role="menuitem" onClick={handleRename} disabled={busy}>
            Renomear
          </button>
          <button type="button" role="menuitem" className="danger" onClick={handleDelete} disabled={busy}>
            Excluir canal
          </button>
        </div>
      )}
    </div>
  );
}
