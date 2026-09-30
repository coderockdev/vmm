import React from "react";
import "./globals.css";
import { ServiceWorkerCleanup } from "./ServiceWorkerCleanup";
import { Sidebar } from "./Sidebar";
import { BellIcon, SearchIcon } from "./icons";
import { UserMenu } from "./UserMenu";
import { getAppUser } from "../core/auth/session";

export const metadata = {
  title: "VMM — Viral Money Machine",
  description: "Cada canal é uma máquina independente de conteúdo.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const user = getAppUser();

  return (
    <html lang="pt-BR">
      <body>
        <ServiceWorkerCleanup />
        <div className="app-shell">
          <Sidebar user={user} />

          <div className="app-content">
            <header className="topbar">
              <button className="icon-button" aria-label="Pesquisar" type="button">
                <SearchIcon size={26} />
              </button>
              <button className="icon-button" aria-label="Notificações" type="button">
                <BellIcon size={25} />
              </button>
              <UserMenu user={user} />
            </header>
            <main className="main-content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
