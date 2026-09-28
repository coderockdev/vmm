"use client";

import React, { useEffect } from "react";

/**
 * Route-level error boundary for /channels/[channelId]. If something throws
 * while rendering the channel workspace, only this segment falls back to
 * this screen — the root layout (sidebar, topbar) keeps running normally
 * instead of the whole app tree unmounting/remounting.
 */
export default function ChannelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Channel page error:", error);
  }, [error]);

  return (
    <div style={{ padding: 40, maxWidth: 640 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Algo deu errado nesta página</h1>
      <p style={{ color: "#777", marginBottom: 16, fontSize: 14 }}>{error.message}</p>
      <button
        type="button"
        onClick={() => reset()}
        style={{
          background: "#14161a",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          padding: "10px 20px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Tentar de novo
      </button>
    </div>
  );
}
