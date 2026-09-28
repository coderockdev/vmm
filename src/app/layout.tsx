import React from "react";
import "./globals.css";
import { ServiceWorkerCleanup } from "./ServiceWorkerCleanup";
import { Sidebar } from "./Sidebar";
import { BellIcon, ChevronRightIcon, SearchIcon } from "./icons";

export const metadata = {
  title: "VMM — Viral Money Machine",
  description: "Cada canal é uma máquina independente de conteúdo.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <ServiceWorkerCleanup />
        <div className="app-shell">
          <Sidebar />

          <div className="app-content">
            <header className="topbar">
              <button className="icon-button" aria-label="Pesquisar" type="button"><SearchIcon size={26} /></button>
              <button className="icon-button" aria-label="Notificações" type="button"><BellIcon size={25} /></button>
              <button className="header-profile" aria-label="Abrir menu do perfil" type="button">
                <span className="header-avatar">D</span>
                <span className="chevron-down"><ChevronRightIcon size={16} /></span>
              </button>
            </header>
            <main className="main-content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
