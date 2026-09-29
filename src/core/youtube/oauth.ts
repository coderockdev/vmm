/**
 * YouTube Data API v3 OAuth helpers (per VMM channel = one Google account).
 */

export const YOUTUBE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
] as const;

/** Expected YouTube channel id when connecting Amor Amor (confirm in UI). */
export const AMOR_AMOR_YOUTUBE_CHANNEL_ID = "UC2msGrvb6wJoTHvpEGiXgvw";

/** Hard pin: VMM channel id → YouTube channel id that must own uploads. */
export function expectedYoutubeChannelIdForVmm(channelId: string): string | null {
  if (channelId === "amor-amor") return AMOR_AMOR_YOUTUBE_CHANNEL_ID;
  return null;
}

export function getYoutubeOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const clientId =
    process.env.YOUTUBE_CLIENT_ID?.trim() ||
    process.env.YOUTUBE_OAUTH_CLIENT_ID?.trim() ||
    "";
  const clientSecret =
    process.env.YOUTUBE_CLIENT_SECRET?.trim() ||
    process.env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim() ||
    "";
  const redirectUri =
    process.env.YOUTUBE_OAUTH_REDIRECT_URI?.trim() ||
    "http://localhost:3000/api/youtube/oauth/callback";

  if (!clientId || !clientSecret) {
    throw new Error(
      "YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET (ou YOUTUBE_OAUTH_*) em falta no .env.local"
    );
  }
  return { clientId, clientSecret, redirectUri };
}

export function isYoutubeOAuthConfigured(): boolean {
  return Boolean(
    (process.env.YOUTUBE_CLIENT_ID?.trim() || process.env.YOUTUBE_OAUTH_CLIENT_ID?.trim()) &&
      (process.env.YOUTUBE_CLIENT_SECRET?.trim() || process.env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim())
  );
}

export function buildYoutubeAuthUrl(args: { state: string }): string {
  const { clientId, redirectUri } = getYoutubeOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YOUTUBE_OAUTH_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: args.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scope: string;
}> {
  const { clientId, clientSecret, redirectUri } = getYoutubeOAuthConfig();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      `OAuth token exchange failed: ${String(data.error_description || data.error || res.status)}`
    );
  }
  return {
    accessToken: String(data.access_token ?? ""),
    refreshToken: data.refresh_token ? String(data.refresh_token) : null,
    expiresIn: Number(data.expires_in ?? 0),
    scope: String(data.scope ?? ""),
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const { clientId, clientSecret } = getYoutubeOAuthConfig();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = String(data.error || "");
    if (code === "invalid_grant") {
      throw new YoutubeAuthError(
        "Token YouTube revogado ou expirado. Volta a «Conectar YouTube»."
      );
    }
    throw new Error(
      `OAuth refresh failed: ${String(data.error_description || data.error || res.status)}`
    );
  }
  return {
    accessToken: String(data.access_token ?? ""),
    expiresIn: Number(data.expires_in ?? 0),
  };
}

export async function fetchMineYoutubeChannel(accessToken: string): Promise<{
  id: string;
  title: string;
  customUrl?: string;
} | null> {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("mine", "true");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as {
    items?: Array<{
      id?: string;
      snippet?: { title?: string; customUrl?: string };
    }>;
    error?: { message?: string; errors?: Array<{ reason?: string }> };
  };
  if (!res.ok) {
    const reason = data.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded") {
      throw new YoutubeQuotaError();
    }
    throw new Error(data.error?.message || `YouTube channels.list failed (${res.status})`);
  }
  const item = data.items?.[0];
  if (!item?.id) return null;
  return {
    id: item.id,
    title: item.snippet?.title || "YouTube",
    customUrl: item.snippet?.customUrl,
  };
}

export class YoutubeAuthError extends Error {
  readonly code = "invalid_grant" as const;
  constructor(message: string) {
    super(message);
    this.name = "YoutubeAuthError";
  }
}

export class YoutubeQuotaError extends Error {
  readonly code = "quotaExceeded" as const;
  constructor(message = "Quota diária da YouTube Data API esgotada. Tenta amanhã (reset ~00:00 PT).") {
    super(message);
    this.name = "YoutubeQuotaError";
  }
}

export function mapYoutubeApiError(err: unknown): Error {
  const anyErr = err as {
    code?: number | string;
    message?: string;
    errors?: Array<{ reason?: string; message?: string }>;
    response?: {
      data?: {
        error?: { message?: string; errors?: Array<{ reason?: string }> };
      };
    };
  };

  const nested = anyErr?.response?.data?.error;
  const reason =
    anyErr?.errors?.[0]?.reason ||
    nested?.errors?.[0]?.reason ||
    "";
  const message =
    nested?.message || anyErr?.message || (err instanceof Error ? err.message : String(err));

  if (
    reason === "invalid_grant" ||
    /invalid_grant/i.test(message) ||
    reason === "authError" ||
    anyErr?.code === 401
  ) {
    return new YoutubeAuthError(
      "Token YouTube revogado ou expirado. Volta a «Conectar YouTube»."
    );
  }
  if (reason === "quotaExceeded" || /quota/i.test(message)) {
    return new YoutubeQuotaError();
  }
  return err instanceof Error ? err : new Error(message);
}
