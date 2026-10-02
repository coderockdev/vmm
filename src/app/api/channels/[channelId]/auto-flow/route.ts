import { NextRequest } from "next/server";
import { getChannel } from "../../../../../core/repo/channels";
import { runAutoFlow } from "../../../../../core/pipeline/autoFlow";
import { VideoFormat } from "../../../../../core/types";

export const maxDuration = 300;

/**
 * NDJSON stream: one JSON object per line.
 * { type: "progress", stage, detail, done, total, projectId? }
 * { type: "done", planId, projectIds, topic, message }
 * { type: "error", error }
 */
export async function POST(req: NextRequest, { params }: { params: { channelId: string } }) {
  const channel = await getChannel(params.channelId);
  if (!channel) {
    return new Response(JSON.stringify({ type: "error", error: "Channel not found" }) + "\n", {
      status: 404,
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const topic = String(body.topic ?? "");
  const quantity = Math.max(1, Math.min(10, Number(body.quantity) || 1));
  const durationMinutes =
    Number(body.durationMinutes) || channel.dna.scriptRules.defaultDurationMinutes;
  const format = (body.format ?? "video") as VideoFormat;
  const sceneCount =
    body.sceneCount != null ? Number(body.sceneCount) : channel.dna.scriptRules.defaultSceneCount ?? 4;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };
      try {
        const result = await runAutoFlow({
          channel,
          topic,
          quantity,
          durationMinutes,
          format,
          sceneCount,
          aiProviderOverride: body.aiProviderOverride ?? null,
          includeManchete: body.includeManchete !== false,
          onProgress: (p) => {
            send({
              type: "progress",
              stage: p.stage,
              detail: p.detail ?? "",
              done: p.done,
              total: p.total,
              projectId: p.projectId ?? null,
              ideaId: p.ideaId ?? null,
              planId: p.planId ?? null,
            });
          },
        });
        send({
          type: "done",
          planId: result.planId,
          projectIds: result.projectIds,
          topic: result.topic,
          message: `${result.projectIds.length} vídeo(s) na fila: voz → música/SFX → vídeo → portada → YouTube`,
        });
      } catch (err) {
        send({
          type: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
