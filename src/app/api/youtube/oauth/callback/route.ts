import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../core/repo/channels";
import {
  exchangeCodeForTokens,
  expectedYoutubeChannelIdForVmm,
  fetchMineYoutubeChannel,
  YOUTUBE_OAUTH_SCOPES,
} from "../../../../../core/youtube/oauth";
import { encryptSecret } from "../../../../../core/crypto/secrets";
import { upsertYoutubeAccount } from "../../../../../core/repo/youtubeAccounts";
import { verifyOAuthState } from "../../../../../core/youtube/oauthState";

export const dynamic = "force-dynamic";

function redirectToChannel(req: NextRequest, channelId: string, params: Record<string, string>) {
  const base =
    process.env.APP_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    req.nextUrl.origin;
  const dest = new URL(`${base}/channels/${channelId}`);
  for (const [k, v] of Object.entries(params)) dest.searchParams.set(k, v);
  dest.searchParams.set("tab", "youtube");
  return NextResponse.redirect(dest.toString());
}

/** Google redirects here after consent. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  if (!state) {
    return NextResponse.json({ error: "state em falta" }, { status: 400 });
  }
  const verified = verifyOAuthState(state);
  if (!verified) {
    return NextResponse.json({ error: "state inválido ou expirado" }, { status: 400 });
  }
  const { channelId } = verified;

  const channel = await getChannel(channelId);
  if (!channel) return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });

  if (oauthError) {
    return redirectToChannel(req, channelId, { yt: "denied", reason: oauthError });
  }
  if (!code) {
    return redirectToChannel(req, channelId, { yt: "error", reason: "code_missing" });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refreshToken) {
      return redirectToChannel(req, channelId, {
        yt: "error",
        reason: "no_refresh_token",
      });
    }
    const mine = await fetchMineYoutubeChannel(tokens.accessToken);
    if (!mine) {
      return redirectToChannel(req, channelId, {
        yt: "error",
        reason: "no_youtube_channel",
      });
    }

    const expected = expectedYoutubeChannelIdForVmm(channelId);
    if (expected && mine.id !== expected) {
      return redirectToChannel(req, channelId, {
        yt: "error",
        reason: `wrong_channel:${mine.title || mine.id}_expected_AmorAmor_${expected}`,
      });
    }

    await upsertYoutubeAccount({
      channelId,
      youtubeChannelId: mine.id,
      title: mine.title,
      refreshTokenEncrypted: encryptSecret(tokens.refreshToken),
      scopes: tokens.scope || YOUTUBE_OAUTH_SCOPES.join(" "),
    });

    return redirectToChannel(req, channelId, { yt: "connected" });
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 120) : "oauth_failed";
    return redirectToChannel(req, channelId, { yt: "error", reason });
  }
}
