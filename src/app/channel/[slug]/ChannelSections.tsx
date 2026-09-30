"use client";

import React, { createContext, useContext, useState, type ReactNode } from "react";

type ChannelSectionId = "generate" | "ideas" | "thumbnails";

const ChannelSectionsContext = createContext<{ openSection: (section: ChannelSectionId) => void }>({ openSection: () => {} });

/** Lets children (e.g. the content generator) switch the active tab. */
export function useChannelSections() {
  return useContext(ChannelSectionsContext);
}

export function ChannelSections({
  ideasCount,
  imagesCount,
  audiosCount,
  videosCount,
  generator,
  ideas,
  thumbnails,
}: {
  ideasCount: number;
  imagesCount: number;
  audiosCount: number;
  videosCount: number;
  generator: ReactNode;
  ideas: ReactNode;
  thumbnails: ReactNode;
}) {
  const [active, setActive] = useState<ChannelSectionId>("generate");
  return (
    <ChannelSectionsContext.Provider value={{ openSection: setActive }}>
      <nav className="channel-view-tabs" aria-label="Seções do canal">
        <button type="button" className={`channel-view-tab${active === "generate" ? " active" : ""}`} aria-current={active === "generate" ? "page" : undefined} onClick={() => setActive("generate")}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6m-5 3h4m-2-20a7 7 0 0 0-4.5 12.4c.9.8 1.5 1.6 1.5 2.6h6c0-1 .6-1.8 1.5-2.6A7 7 0 0 0 12 1Z" /></svg> Criar conteúdo
        </button>
        <button type="button" className={`channel-view-tab${active === "ideas" ? " active" : ""}`} aria-current={active === "ideas" ? "page" : undefined} onClick={() => setActive("ideas")}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2.5h8l5 5V21H6z" /><path d="M14 2.5v5h5M9 12h7m-7 4h7" /></svg> Roteiros <small>{ideasCount}</small>
        </button>
        <button type="button" className={`channel-view-tab${active === "thumbnails" ? " active" : ""}`} aria-current={active === "thumbnails" ? "page" : undefined} onClick={() => setActive("thumbnails")}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" /></svg> Thumbnails <small>{imagesCount}</small>
        </button>
        <span className="channel-view-tab channel-view-tab-placeholder">Imagens <small>{imagesCount}</small></span>
        <span className="channel-view-tab channel-view-tab-placeholder">Áudios <small>{audiosCount}</small></span>
        <span className="channel-view-tab channel-view-tab-placeholder">Vídeos <small>{videosCount}</small></span>
      </nav>
      <div hidden={active !== "generate"}>{generator}</div>
      <div hidden={active !== "ideas"}>{ideas}</div>
      <div hidden={active !== "thumbnails"}>{thumbnails}</div>
    </ChannelSectionsContext.Provider>
  );
}
