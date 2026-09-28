import { randomUUID } from "crypto";
import { getDb } from "../db";
import { getSupabase, isSupabaseEnabled, assertNoError } from "../supabaseClient";
import { Channel, ChannelDNA } from "../types";

interface ChannelRow {
  id: string;
  name: string;
  niche: string;
  cover_color: string;
  cover_ref: string | null;
  dna_json: string | object;
  created_at: string;
  updated_at: string;
}

function normalizeDna(raw: ChannelDNA): ChannelDNA {
  return {
    ...raw,
    scriptRules: {
      ...raw.scriptRules,
      generationPrompt: raw.scriptRules?.generationPrompt ?? "",
    },
  };
}

function rowToChannel(row: ChannelRow): Channel {
  const parsed = typeof row.dna_json === "string" ? JSON.parse(row.dna_json) : (row.dna_json as ChannelDNA);
  return {
    id: row.id,
    name: row.name,
    niche: row.niche,
    coverColor: row.cover_color,
    coverRef: row.cover_ref ?? null,
    dna: normalizeDna(parsed),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listChannels(): Promise<Channel[]> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase().from("channels").select("*").order("created_at", { ascending: true });
    return assertNoError(res).map(rowToChannel);
  }
  const rows = getDb().prepare(`SELECT * FROM channels ORDER BY created_at ASC`).all() as ChannelRow[];
  return rows.map(rowToChannel);
}

export async function getChannel(id: string): Promise<Channel | null> {
  if (isSupabaseEnabled()) {
    const res = await getSupabase().from("channels").select("*").eq("id", id).maybeSingle();
    const row = assertNoError(res);
    return row ? rowToChannel(row as ChannelRow) : null;
  }
  const row = getDb().prepare(`SELECT * FROM channels WHERE id = ?`).get(id) as ChannelRow | undefined;
  return row ? rowToChannel(row) : null;
}

export async function createChannel(input: {
  id?: string;
  name: string;
  niche: string;
  coverColor: string;
  dna: ChannelDNA;
}): Promise<Channel> {
  const now = new Date().toISOString();
  const id = input.id ?? (await slugify(input.name));

  if (isSupabaseEnabled()) {
    const res = await getSupabase()
      .from("channels")
      .insert({
        id,
        name: input.name,
        niche: input.niche,
        cover_color: input.coverColor,
        dna_json: input.dna,
        created_at: now,
        updated_at: now,
      });
    assertNoError(res);
    return (await getChannel(id))!;
  }

  getDb()
    .prepare(
      `INSERT INTO channels (id, name, niche, cover_color, dna_json, created_at, updated_at)
       VALUES (@id, @name, @niche, @coverColor, @dna, @createdAt, @updatedAt)`
    )
    .run({
      id,
      name: input.name,
      niche: input.niche,
      coverColor: input.coverColor,
      dna: JSON.stringify(input.dna),
      createdAt: now,
      updatedAt: now,
    });
  return (await getChannel(id))!;
}

export async function updateChannelDna(id: string, dna: ChannelDNA): Promise<Channel> {
  const now = new Date().toISOString();
  if (isSupabaseEnabled()) {
    assertNoError(await getSupabase().from("channels").update({ dna_json: dna, updated_at: now }).eq("id", id));
    return (await getChannel(id))!;
  }
  getDb().prepare(`UPDATE channels SET dna_json = ?, updated_at = ? WHERE id = ?`).run(JSON.stringify(dna), now, id);
  return (await getChannel(id))!;
}

export async function updateChannelCoverRef(id: string, coverRef: string | null): Promise<void> {
  const now = new Date().toISOString();
  if (isSupabaseEnabled()) {
    assertNoError(
      await getSupabase().from("channels").update({ cover_ref: coverRef, updated_at: now }).eq("id", id)
    );
    return;
  }
  getDb().prepare(`UPDATE channels SET cover_ref = ?, updated_at = ? WHERE id = ?`).run(coverRef, now, id);
}

export async function updateChannelMeta(
  id: string,
  fields: Partial<Pick<Channel, "name" | "niche" | "coverColor">>
): Promise<Channel> {
  const current = await getChannel(id);
  if (!current) throw new Error(`Channel not found: ${id}`);
  const now = new Date().toISOString();
  const name = fields.name ?? current.name;
  const niche = fields.niche ?? current.niche;
  const coverColor = fields.coverColor ?? current.coverColor;

  if (isSupabaseEnabled()) {
    assertNoError(
      await getSupabase()
        .from("channels")
        .update({ name, niche, cover_color: coverColor, updated_at: now })
        .eq("id", id)
    );
    return (await getChannel(id))!;
  }

  getDb()
    .prepare(`UPDATE channels SET name = ?, niche = ?, cover_color = ?, updated_at = ? WHERE id = ?`)
    .run(name, niche, coverColor, now, id);
  return (await getChannel(id))!;
}

export async function slugify(name: string): Promise<string> {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const existing = await getChannel(base);
  if (!existing) return base || randomUUID();
  return `${base}-${randomUUID().slice(0, 6)}`;
}
