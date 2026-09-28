"use client";

import { useEffect } from "react";

const RELOAD_KEY = "vmm:legacy-service-worker-cleaned";

/**
 * This app does not install a service worker. During local development an older
 * app previously served on localhost:3000 can still control this origin and
 * return stale HTML/CSS. Remove that legacy worker and its Cache Storage once.
 */
export function ServiceWorkerCleanup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    async function removeLegacyWorker() {
      const registrations = await navigator.serviceWorker.getRegistrations();
      if (registrations.length === 0) {
        sessionStorage.removeItem(RELOAD_KEY);
        return;
      }

      await Promise.all(registrations.map((registration) => registration.unregister()));

      if ("caches" in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
      }

      if (navigator.serviceWorker.controller && !sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, "1");
        window.location.reload();
      }
    }

    removeLegacyWorker().catch(() => {
      // Cleanup is preventive and must never block the interface.
    });
  }, []);

  return null;
}
