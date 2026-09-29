"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRightIcon, GearIcon } from "./icons";

export type UserMenuProfile = {
  name: string;
  email: string;
  plan: string;
  initial: string;
};

export function UserMenu({ user }: { user: UserMenuProfile }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
      setOpen(false);
    }
  }

  return (
    <div className={`user-menu${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="user-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <GearIcon size={18} />
        <span>Configurações</span>
        <span className="header-avatar user-menu-avatar" aria-hidden>
          {user.initial}
        </span>
        <span className="chevron-down">
          <ChevronRightIcon size={16} />
        </span>
      </button>

      {open && (
        <div className="user-menu-panel" role="menu">
          <div className="user-menu-profile">
            <span className="header-avatar">{user.initial}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
              <em>{user.plan}</em>
            </div>
          </div>
          <Link
            href="/settings"
            className="user-menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <GearIcon size={18} />
            Abrir configurações
          </Link>
          <button
            type="button"
            className="user-menu-item is-danger"
            role="menuitem"
            disabled={loggingOut}
            onClick={() => void logout()}
          >
            {loggingOut ? "Saindo…" : "Deslogar"}
          </button>
        </div>
      )}
    </div>
  );
}
