import { NextRequest } from "next/server";
import { getChannel } from "../../../../../../core/repo/channels";
import { resumeAutoFlow } from "../../../../../../core/pipeline/autoFlow";

export const maxDuration = 300;

/**
 * Resume stuck auto-flow projects (script ready, voice not queued, etc.)
 * without regenerating ideas/scripts — preserves LLM spend.
 *
 * NDJSON stream: progress | done | error
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
  const projectIds = Array.isArray(body.projectIds)
    ? body.projectIds.map((id: unknown) => String(id)).filter(Boolean)
    : undefined;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };
      try {
        const result = await resumeAutoFlow({
          channel,
          projectIds,
          onProgress: (p) => {
            send({
              type: "progress",
              stage: p.stage,
              detail: p.detail ?? "",
              done: p.done,
              total: p.total,
              projectId: p.projectId ?? null,
            });
          },
        });
        send({
          type: "done",
          projectIds: result.projectIds,
          resumed: result.resumed,
          skipped: result.skipped,
          message: `${result.resumed.length} retomado(s), ${result.skipped.length} já a correr — sem novo roteiro`,
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
