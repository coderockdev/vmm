"use client";

import React from "react";
import type { ChapterPart } from "../../../core/audiobook/chapterLog";
import { partClock } from "./chapterProgress";

export function ChapterParts({
  parts,
}: {
  parts: Array<Pick<ChapterPart, "label" | "percent" | "detail" | "startedAt" | "finishedAt"> & { id: string }>;
}) {
  return (
    <ul className="chapter-parts">
      {parts.map((part) => {
        const state = part.percent >= 100 || part.finishedAt ? "done" : part.startedAt ? "run" : "wait";
        const when = part.startedAt
          ? `${partClock(part.startedAt)} → ${part.finishedAt ? partClock(part.finishedAt) : "agora"}`
          : "—";
        return (
          <li key={part.id} className={`chapter-part is-${state}`}>
            <span>{part.label}</span>
            <span>{part.percent}%</span>
            <span>{part.detail}</span>
            <span>{when}</span>
          </li>
        );
      })}
    </ul>
  );
}
