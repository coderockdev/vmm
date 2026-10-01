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

type VoiceLanguage = "pt" | "es" | "en";

function voiceLanguage(raw: string | null): VoiceLanguage {
  if (raw === "pt" || raw === "es" || raw === "en") return raw;
  return "es";
}

function accentRank(accents: unknown, language: VoiceLanguage, country: string): number {
  const label = `${accentLabel(accents, "")} ${country}`.toLowerCase();
  if (language === "pt") {
    if (label.includes("pt-br") || label.includes("brazil") || country.toUpperCase() === "BR") return 0;
    if (label.includes("pt-pt") || label.includes("portugal") || country.toUpperCase() === "PT") return 1;
    return 2;
  }
  if (language === "es") {
    if (label.includes("es-co") || label.includes("colomb")) return 0;
    if (label.includes("es-419") || label.includes("latin")) return 1;
    if (label.includes("es-mx") || label.includes("mexic")) return 2;
    return 3;
  }
  if (label.includes("en-us") || country.toUpperCase() === "US") return 0;
  return 1;
}

/**
 * Proxies Cartesia voice list. Keys stay on the server.
 * Only voices whose native language matches `language` are returned
 * (Cartesia's filter also includes multilingual voices).
 * GET /api/voices/cartesia?language=pt&q=&starting_after=&gender=all
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
  const gender = searchParams.get("gender") ?? "all";
  const language = voiceLanguage(searchParams.get("language"));
  const limit = Math.min(40, Math.max(1, Number(searchParams.get("limit") ?? 24) || 24));

  const cacheKey = `ca:v3:${language}:${q}:${startingAfter}:${gender}:${limit}`;
  const cached = getCached(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const matched: any[] = [];
    let cursor = startingAfter;
    let apiHasMore = true;
    for (let page = 0; page < 6 && matched.length <= limit && apiHasMore; page++) {
      const url = new URL("https://api.cartesia.ai/voices");
      url.searchParams.set("language", language);
      url.searchParams.set("limit", "100");
      url.searchParams.append("expand[]", "preview_file_url");
      if (gender && gender !== "all") url.searchParams.set("gender", gender);
      if (q) url.searchParams.set("q", q);
      if (cursor) url.searchParams.set("starting_after", cursor);

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
      for (const voice of raw) {
        if (String(voice?.language ?? "") !== language) continue;
        matched.push(voice);
        if (matched.length > limit) break;
      }
      apiHasMore = Boolean(data.has_more && data.next_page);
      cursor = String(data.next_page ?? "");
      if (!cursor) apiHasMore = false;
    }

    const pageVoices = matched.slice(0, limit);
    const nextId = pageVoices.length ? String(pageVoices[pageVoices.length - 1].id ?? "") : "";
    const sorted = [...pageVoices].sort(
      (a, b) =>
        accentRank(a.accents, language, String(a.country ?? "")) -
        accentRank(b.accents, language, String(b.country ?? ""))
    );
    const voices = sorted.map((v) => ({
      id: String(v.id ?? ""),
      name: String(v.name ?? "Sem nome"),
      accent: accentLabel(v.accents, language),
      gender: String(v.gender ?? ""),
      description: String(v.description ?? "").slice(0, 160),
      previewUrl: v.preview_file_url ?? v.preview_url ?? null,
      language,
      provider: "cartesia" as const,
    }));
    const hasMore = matched.length > limit || apiHasMore;
    const payload = {
      language,
      voices,
      nextStartingAfter: hasMore && nextId ? nextId : null,
      hasMore,
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
