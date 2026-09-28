import { randomUUID } from "crypto";
import { getDb } from "../db";
import { Channel, ChannelDNA } from "../types";

interface ChannelRow {
  id: string;
  name: string;
  niche: string;
  cover_color: string;
  dna_json: string;
  created_at: string;
  updated_at: string;
}

function rowToChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    name: row.name,
    niche: row.niche,
    coverColor: row.cover_color,
    dna: JSON.parse(row.dna_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listChannels(): Channel[] {
  const rows = getDb()
    .prepare(`SELECT * FROM channels ORDER BY created_at ASC`)
    .all() as ChannelRow[];
  return rows.map(rowToChannel);
}

export function getChannel(id: string): Channel | null {
  const row = getDb()
    .prepare(`SELECT * FROM channels WHERE id = ?`)
    .get(id) as ChannelRow | undefined;
  return row ? rowToChannel(row) : null;
}

export function createChannel(input: {
  id?: string;
  name: string;
  niche: string;
  coverColor: string;
  dna: ChannelDNA;
}): Channel {
  const now = new Date().toISOString();
  const id = input.id ?? slugify(input.name);
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
  return getChannel(id)!;
}

export function updateChannelDna(id: string, dna: ChannelDNA): Channel {
  getDb()
    .prepare(`UPDATE channels SET dna_json = ?, updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(dna), new Date().toISOString(), id);
  return getChannel(id)!;
}

export function updateChannelMeta(
  id: string,
  fields: Partial<Pick<Channel, "name" | "niche" | "coverColor">>
): Channel {
  const current = getChannel(id);
  if (!current) throw new Error(`Channel not found: ${id}`);
  getDb()
    .prepare(
      `UPDATE channels SET name = ?, niche = ?, cover_color = ?, updated_at = ? WHERE id = ?`
    )
    .run(
      fields.name ?? current.name,
      fields.niche ?? current.niche,
      fields.coverColor ?? current.coverColor,
      new Date().toISOString(),
      id
    );
  return getChannel(id)!;
}

export function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const existing = getChannel(base);
  if (!existing) return base || randomUUID();
  return `${base}-${randomUUID().slice(0, 6)}`;
}
