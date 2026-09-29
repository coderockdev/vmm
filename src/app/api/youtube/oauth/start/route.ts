import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "../../../../../core/repo/channels";
import {
  buildYoutubeAuthUrl,
  isYoutubeOAuthConfigured,
} from "../../../../../core/youtube/oauth";
import { isEncryptionConfigured } from "../../../../../core/crypto/secrets";
import { signOAuthState } from "../../../../../core/youtube/oauthState";

export const dynamic = "force-dynamic";

/** GET /api/youtube/oauth/start?channelId=amor-amor → redirect to Google consent */
export async function GET(req: NextRequest) {
  const channelId = req.nextUrl.searchParams.get("channelId")?.trim();
  if (!channelId) {
    return NextResponse.json({ error: "channelId obrigatório" }, { status: 400 });
  }

  const channel = await getChannel(channelId);
  if (!channel) return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });

  if (!isYoutubeOAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          "OAuth YouTube não configurado. Adiciona YOUTUBE_OAUTH_CLIENT_ID e YOUTUBE_OAUTH_CLIENT_SECRET ao .env.local",
      },
      { status: 503 }
    );
  }
  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      {
        error: "APP_ENCRYPTION_KEY em falta. Gera com: openssl rand -base64 32",
      },
      { status: 503 }
    );
  }

  try {
    const state = signOAuthState(channelId);
    const url = buildYoutubeAuthUrl({ state });
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
