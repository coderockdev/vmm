import { randomUUID } from "crypto";
import { getDb } from "../db";
import { getSupabase, isSupabaseEnabled, assertNoError } from "../supabaseClient";

export type YoutubeAccount = {
  id: string;
  channelId: string;
  youtubeChannelId: string;
  title: string;
  refreshTokenEncrypted: string;
  scopes: string;
  connectedAt: string;
};

interface YoutubeAccountRow {
  id: string;
  channel_id: string;
  youtube_channel_id: string;
  title: string;
  refresh_token_encrypted: string;
  scopes: string;
  connected_at: string;
}

function rowToAccount(row: YoutubeAccountRow): YoutubeAccount {
  return {
    id: row.id,
    channelId: row.channel_id,
    youtubeChannelId: row.youtube_channel_id,
    title: row.title,
    refreshTokenEncrypted: row.refresh_token_encrypted,
    scopes: row.scopes,
    connectedAt: row.connected_at,
  };
}

export async function getYoutubeAccountForChannel(
  channelId: string
): Promise<YoutubeAccount | null> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase()
      .from("youtube_accounts")
      .select("*")
      .eq("channel_id", channelId)
      .maybeSingle();
    const row = assertNoError(res);
    return row ? rowToAccount(row as YoutubeAccountRow) : null;
  }
  const row = getDb()
    .prepare(`SELECT * FROM youtube_accounts WHERE channel_id = ?`)
    .get(channelId) as YoutubeAccountRow | undefined;
  return row ? rowToAccount(row) : null;
}

export async function upsertYoutubeAccount(input: {
  channelId: string;
  youtubeChannelId: string;
  title: string;
  refreshTokenEncrypted: string;
  scopes: string;
}): Promise<YoutubeAccount> {
  const existing = await getYoutubeAccountForChannel(input.channelId);
  const id = existing?.id ?? randomUUID();
  const connectedAt = new Date().toISOString();

  if (isSupabaseEnabled()) {
    assertNoError(
      await getSupabase().from("youtube_accounts").upsert({
        id,
        channel_id: input.channelId,
        youtube_channel_id: input.youtubeChannelId,
        title: input.title,
        refresh_token_encrypted: input.refreshTokenEncrypted,
        scopes: input.scopes,
        connected_at: connectedAt,
      })
    );
    return (await getYoutubeAccountForChannel(input.channelId))!;
  }

  getDb()
    .prepare(
      `INSERT INTO youtube_accounts
        (id, channel_id, youtube_channel_id, title, refresh_token_encrypted, scopes, connected_at)
       VALUES (@id, @channelId, @youtubeChannelId, @title, @refreshTokenEncrypted, @scopes, @connectedAt)
       ON CONFLICT(channel_id) DO UPDATE SET
         youtube_channel_id = excluded.youtube_channel_id,
         title = excluded.title,
         refresh_token_encrypted = excluded.refresh_token_encrypted,
         scopes = excluded.scopes,
         connected_at = excluded.connected_at`
    )
    .run({
      id,
      channelId: input.channelId,
      youtubeChannelId: input.youtubeChannelId,
      title: input.title,
      refreshTokenEncrypted: input.refreshTokenEncrypted,
      scopes: input.scopes,
      connectedAt,
    });
  return (await getYoutubeAccountForChannel(input.channelId))!;
}

export async function deleteYoutubeAccount(channelId: string): Promise<void> {
  if (isSupabaseEnabled()) {
    assertNoError(
      await getSupabase().from("youtube_accounts").delete().eq("channel_id", channelId)
    );
    return;
  }
  getDb().prepare(`DELETE FROM youtube_accounts WHERE channel_id = ?`).run(channelId);
}
