import { NextResponse } from "next/server";
import { getChannel } from "../../../../../core/repo/channels";
import {
  deleteYoutubeAccount,
  getYoutubeAccountForChannel,
} from "../../../../../core/repo/youtubeAccounts";
import {
  AMOR_AMOR_YOUTUBE_CHANNEL_ID,
  expectedYoutubeChannelIdForVmm,
  isYoutubeOAuthConfigured,
} from "../../../../../core/youtube/oauth";
import { isEncryptionConfigured } from "../../../../../core/crypto/secrets";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { channelId: string } }
) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const account = await getYoutubeAccountForChannel(channel.id);
  const expectedYoutubeChannelId = expectedYoutubeChannelIdForVmm(channel.id);
  const channelMismatch = Boolean(
    account &&
      expectedYoutubeChannelId &&
      account.youtubeChannelId !== expectedYoutubeChannelId
  );

  return NextResponse.json({
    configured: isYoutubeOAuthConfigured() && isEncryptionConfigured(),
    oauthReady: isYoutubeOAuthConfigured(),
    encryptionReady: isEncryptionConfigured(),
    expectedYoutubeChannelId,
    expectedHandle: channel.id === "amor-amor" ? "@amoramor333" : null,
    channelMismatch,
    account: account
      ? {
          youtubeChannelId: account.youtubeChannelId,
          title: account.title,
          connectedAt: account.connectedAt,
          scopes: account.scopes,
        }
      : null,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { channelId: string } }
) {
  const channel = await getChannel(params.channelId);
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteYoutubeAccount(channel.id);
  return NextResponse.json({ ok: true });
}
