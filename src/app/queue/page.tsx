"use client";

import React, { useEffect, useState } from "react";

interface JobRow {
  id: string;
  videoProjectId: string;
  channelId: string | null;
  channelName: string;
  projectTitle: string;
  status: string;
  progress: number;
  statusMessage: string;
}

const STATUS_LABEL: Record<string, string> = {
  planned: "Aguardando",
  script: "Gerando roteiro",
  audio: "Gerando áudio",
  timing: "Sincronizando texto",
  composing: "Preparando composição",
  rendering: "Renderizando",
  completed: "Concluído",
  failed: "Falhou",
};

export default function QueuePage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/jobs");
      const data = await res.json();
      if (!cancelled) setJobs(data.jobs ?? []);
    }
    load();
    const interval = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const groups = jobs.reduce<Record<string, JobRow[]>>((acc, job) => {
    (acc[job.channelName] ??= []).push(job);
    return acc;
  }, {});

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 20 }}>Fila de Produção</h1>
      {Object.keys(groups).length === 0 && <p style={{ color: "var(--text-dim)" }}>Nenhum job ainda.</p>}
      {Object.entries(groups).map(([channelName, channelJobs]) => (
        <div key={channelName} style={{ marginBottom: 28 }}>
          <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: "var(--text-dim)", marginBottom: 10 }}>
            {channelName.toUpperCase()}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {channelJobs.map((job) => (
              <div
                key={job.id}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: 14,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}>{job.projectTitle}</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color:
                        job.status === "completed"
                          ? "var(--success)"
                          : job.status === "failed"
                          ? "var(--danger)"
                          : "var(--accent)",
                    }}
                  >
                    {STATUS_LABEL[job.status] ?? job.status}
                  </span>
                </div>
                <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${job.progress}%`,
                      background: job.status === "failed" ? "var(--danger)" : "var(--accent)",
                      transition: "width .3s",
                    }}
                  />
                </div>
                <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>
                  {job.statusMessage} · {job.progress}%
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
