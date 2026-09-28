import { NextRequest, NextResponse } from "next/server";

type CacheEntry = { at: number; body: unknown };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 10 * 60 * 1000;

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

/**
 * Proxies ElevenLabs shared voice library. Keys stay on the server.
 * GET /api/voices/elevenlabs?q=&page=0&gender=male
 */
export async function GET(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY não configurada no servidor." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const page = Number(searchParams.get("page") ?? "0") || 0;
  const gender = searchParams.get("gender") ?? "male";
  const pageSize = 6;

  const cacheKey = `el:${q}:${page}:${gender}`;
  const cached = getCached(cacheKey);
  if (cached) return NextResponse.json(cached);

  const url = new URL("https://api.elevenlabs.io/v1/shared-voices");
  url.searchParams.set("language", "es");
  url.searchParams.set("page_size", String(pageSize));
  url.searchParams.set("page", String(page));
  if (gender && gender !== "all") url.searchParams.set("gender", gender);
  if (q) url.searchParams.set("search", q);
  // Prefer Latin American accents when no explicit search
  if (!q) url.searchParams.set("accent", "latin american");

  try {
    const res = await fetch(url.toString(), {
      headers: { "xi-api-key": apiKey },
      next: { revalidate: 600 },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const status = res.status === 401 || res.status === 429 ? res.status : 502;
      return NextResponse.json(
        {
          error:
            res.status === 401
              ? "ElevenLabs: chave inválida (401)."
              : res.status === 429
                ? "ElevenLabs: limite de taxa (429). Tente em instantes."
                : `ElevenLabs falhou (${res.status}): ${body.slice(0, 200)}`,
        },
        { status }
      );
    }
    const data = await res.json();
    const voices = (data.voices ?? data ?? []).map((v: any) => ({
      id: String(v.voice_id ?? v.public_owner_id ?? v.id ?? ""),
      name: String(v.name ?? "Sem nome"),
      accent: String(v.accent ?? v.locale ?? ""),
      age: String(v.age ?? ""),
      gender: String(v.gender ?? ""),
      description: String(v.description ?? v.descriptive ?? "").slice(0, 160),
      previewUrl: v.preview_url ?? null,
      provider: "elevenlabs" as const,
    }));
    const payload = { voices, page, hasMore: voices.length >= pageSize };
    setCache(cacheKey, payload);
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "Sem conexão com ElevenLabs. Verifique a rede." },
      { status: 503 }
    );
  }
}
