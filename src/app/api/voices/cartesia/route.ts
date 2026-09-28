import { NextRequest, NextResponse } from "next/server";

type CacheEntry = { at: number; body: unknown };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 10 * 60 * 1000;
const CARTESIA_VERSION = process.env.CARTESIA_API_VERSION || "2026-08-14";

function getCached(key: string): unknown | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.body;
}

function setCache(key: string, body: unknown) {
  cache.set(key, { at: Date.now(), body });
}

function accentLabel(accents: unknown, fallback: string): string {
  if (Array.isArray(accents)) {
    const parts = accents.map((a) => {
      if (typeof a === "string") return a;
      if (a && typeof a === "object") {
        const o = a as Record<string, unknown>;
        return String(o.code ?? o.name ?? o.locale ?? o.accent ?? "");
      }
      return "";
    }).filter(Boolean);
    if (parts.length) return parts.join(", ");
  } else if (typeof accents === "string" && accents) {
    return accents;
  } else if (accents && typeof accents === "object") {
    const o = accents as Record<string, unknown>;
    const s = String(o.code ?? o.name ?? o.locale ?? o.accent ?? "");
    if (s && s !== "[object Object]") return s;
  }
  return fallback;
}

function accentRank(accents: unknown): number {
  const label = accentLabel(accents, "").toLowerCase();
  if (label.includes("es-co") || label.includes("colomb")) return 0;
  if (label.includes("es-419") || label.includes("latin")) return 1;
  if (label.includes("es-mx") || label.includes("mexic")) return 2;
  return 3;
}

/**
 * Proxies Cartesia voice list. Keys stay on the server.
 * GET /api/voices/cartesia?q=&starting_after=&gender=masculine
 */
export async function GET(req: NextRequest) {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "CARTESIA_API_KEY não configurada no servidor." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const startingAfter = searchParams.get("starting_after") ?? "";
  const gender = searchParams.get("gender") ?? "masculine";
  const limit = 6;

  const cacheKey = `ca:v2:${q}:${startingAfter}:${gender}`;
  const cached = getCached(cacheKey);
  if (cached) return NextResponse.json(cached);

  const url = new URL("https://api.cartesia.ai/voices");
  url.searchParams.set("language", "es");
  url.searchParams.set("limit", String(limit));
  url.searchParams.append("expand[]", "preview_file_url");
  if (gender && gender !== "all") url.searchParams.set("gender", gender);
  if (q) url.searchParams.set("q", q);
  if (startingAfter) url.searchParams.set("starting_after", startingAfter);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Cartesia-Version": CARTESIA_VERSION,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const status = res.status === 401 || res.status === 429 ? res.status : 502;
      return NextResponse.json(
        {
          error:
            res.status === 401
              ? "Cartesia: chave inválida (401)."
              : res.status === 429
                ? "Cartesia: limite de taxa (429). Tente em instantes."
                : `Cartesia falhou (${res.status}): ${body.slice(0, 200)}`,
        },
        { status }
      );
    }
    const data = await res.json();
    const raw = Array.isArray(data) ? data : data.data ?? data.voices ?? [];
    const sorted = [...raw].sort(
      (a: any, b: any) => accentRank(a.accents) - accentRank(b.accents)
    );
    const voices = sorted.map((v: any) => ({
      id: String(v.id ?? ""),
      name: String(v.name ?? "Sem nome"),
      accent: accentLabel(v.accents, String(v.language ?? "es")),
      gender: String(v.gender ?? ""),
      description: String(v.description ?? "").slice(0, 160),
      previewUrl: v.preview_file_url ?? v.preview_url ?? null,
      provider: "cartesia" as const,
    }));
    const lastId = voices.length ? voices[voices.length - 1].id : null;
    const payload = {
      voices,
      nextStartingAfter: voices.length >= limit ? lastId : null,
      hasMore: voices.length >= limit,
    };
    setCache(cacheKey, payload);
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Sem conexão com Cartesia: ${message}` },
      { status: 503 }
    );
  }
}
