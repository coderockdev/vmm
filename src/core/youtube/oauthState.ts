import { createHmac, randomBytes } from "crypto";

function stateSecret(): string {
  return (
    process.env.APP_ENCRYPTION_KEY?.trim() ||
    process.env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim() ||
    "vmm-dev-state"
  );
}

export function signOAuthState(channelId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      channelId,
      nonce: randomBytes(12).toString("hex"),
      exp: Date.now() + 15 * 60 * 1000,
    })
  ).toString("base64url");
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyOAuthState(state: string): { channelId: string } | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  if (expected !== sig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      channelId?: string;
      exp?: number;
    };
    if (!data.channelId || !data.exp || data.exp < Date.now()) return null;
    return { channelId: data.channelId };
  } catch {
    return null;
  }
}
