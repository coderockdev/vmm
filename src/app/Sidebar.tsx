"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BoxIcon,
  ChevronRightIcon,
  GearIcon,
  GridIcon,
  HelpIcon,
  HomeIcon,
  ListIcon,
  UploadIcon,
} from "./icons";

const COLLAPSED_STORAGE_KEY = "vmm-sidebar-collapsed";

const NAV = [
  { href: "/", label: "Canais", icon: HomeIcon },
  { href: "/queue", label: "Fila de produção", icon: ListIcon },
  { href: "/renders", label: "Biblioteca", icon: BoxIcon },
  { href: "/settings", label: "Modelos", icon: GridIcon },
  { href: "/renders", label: "Exportações", icon: UploadIcon },
];

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 38 44" fill="none" aria-hidden="true">
      <path
        d="M4 4.8v33.8c0 2.3 2.7 3.5 4.5 2.1L30 24.9a6.2 6.2 0 0 0 0-10L8.5 1.2C6.7-.1 4 1.2 4 4.8Z"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path d="M11 9.5v23.8L33.5 20 11 6.7v2.8Z" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Dedicated sidebar component, isolated from the page content so a runtime
 * error inside a route's content never has any code path that could affect
 * the sidebar's own render — they're fully independent trees.
 */
export function Sidebar() {
  const pathname = usePathname();
  // "/channels/..." routes are also part of the "Canais" section.
  const isCanaisActive = pathname === "/" || pathname.startsWith("/channels");

  const [collapsed, setCollapsed] = useState(false);

  // Read the saved preference after mount only — localStorage isn't
  // available during SSR, and defaulting to "expanded" there avoids a
  // hydration mismatch (worst case: one frame before it collapses back).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1");
    } catch {
      // localStorage unavailable (private mode, etc.) — just stay expanded.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore — preference just won't persist this session
      }
      return next;
    });
  }

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="brand-row">
        <a href="/" className="brand">
          <BrandMark />
          <span className="brand-copy">
            <strong>VMM</strong>
            <small>VIRAL MONEY MACHINE</small>
          </span>
        </a>
        <button
          type="button"
          className="sidebar-collapse-toggle"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
          aria-pressed={collapsed}
        >
          <ChevronRightIcon size={14} />
        </button>
      </div>

      <nav className="primary-nav" aria-label="Navegação principal">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/" ? isCanaisActive : pathname === item.href;
          const className = `nav-item${active ? " active" : ""}`;
          const content = (
            <>
              <Icon size={24} />
              <span>{item.label}</span>
            </>
          );
          // The channels dashboard must always refetch after a mutation. A
          // native navigation avoids Next's client-side router cache serving
          // the dashboard snapshot that was prefetched before channel creation.
          return item.href === "/" ? (
            <a key={item.label} href={item.href} className={className}>{content}</a>
          ) : (
            <Link key={item.label} href={item.href} className={className}>{content}</Link>
          );
        })}
      </nav>

      <div className="sidebar-divider" />
      <div className="sidebar-spacer" />

      <nav className="secondary-nav" aria-label="Suporte">
        <Link href="/settings" className="nav-item">
          <GearIcon size={23} /> <span>Configurações</span>
        </Link>
        <Link href="/settings" className="nav-item">
          <HelpIcon size={23} /> <span>Ajuda</span>
        </Link>
      </nav>

      <div className="profile-block">
        <span className="avatar">D</span>
        <span className="profile-copy">
          <strong>Dev</strong>
          <small>Plano Local</small>
        </span>
        <ChevronRightIcon size={19} color="#f5f6f8" />
      </div>
    </aside>
  );
}
