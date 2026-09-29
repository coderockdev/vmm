import { getChannel, createChannel, updateChannelDna } from "./repo/channels";
import { SEED_CHANNELS } from "./seedData";
import { reconcileStuckJobs } from "./pipeline/reconcile";
import { isSupabaseEnabled } from "./supabaseClient";
import type { ChannelDNA } from "./types";

/**
 * Idempotent by design: every page that reads channel data calls this first.
 * With an async DB (Supabase) two requests can both see "not found" before
 * either insert lands, so a duplicate-key error here means someone else won
 * the race — that's success, not a real failure, and is swallowed.
 *
 * Also reconciles any ProductionJob left orphaned by a previous process
 * crash/restart (see pipeline/reconcile.ts) — piggybacking here means every
 * page load gets a sane job list without a dedicated server-startup hook.
 *
 * Set FORCE_SEED_DNA=1 to overwrite DNA on existing seed channels from
 * seedData (use when Supabase drifted / generationPrompt empty).
 */
export async function ensureSeeded(options: { allowRemoteSeed?: boolean } = {}): Promise<void> {
  await reconcileStuckJobs();
  const forceDna = process.env.FORCE_SEED_DNA === "1" || process.env.FORCE_SEED_DNA === "true";

  // Always heal Julio Verne audiobook mode — Supabase DNA often drifts to viral
  // and then the channel shows Criar/Ideias/Roteiros instead of Livros.
  await healJulioVerneAudiobookMode().catch((err) => {
    // eslint-disable-next-line no-console
    console.warn("[seed] julio-verne mode heal failed:", err);
  });

  await healAmorAmorMusicalStandards().catch((err) => {
    // eslint-disable-next-line no-console
    console.warn("[seed] amor-amor musical heal failed:", err);
  });

  // Supabase is the user's persistent source of truth. Recreating demo rows
  // on every page load makes an intentional DELETE look like it failed.
  // Remote seed creation now happens only through the explicit seed command
  // (or the existing FORCE_SEED_DNA maintenance override).
  if (isSupabaseEnabled() && !options.allowRemoteSeed && !forceDna) return;

  for (const seed of SEED_CHANNELS) {
    const existing = await getChannel(seed.id);
    if (!existing) {
      try {
        await createChannel({
          id: seed.id,
          name: seed.name,
          niche: seed.niche,
          coverColor: seed.coverColor,
          dna: seed.dna,
        });
        // eslint-disable-next-line no-console
        console.log(`[seed] created channel ${seed.id}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!/duplicate key|unique constraint/i.test(message)) throw err;
      }
      continue;
    }
    if (forceDna) {
      await updateChannelDna(seed.id, seed.dna);
      // eslint-disable-next-line no-console
      console.log(`[seed] synced DNA for ${seed.id}`);
    }
  }
}

/** Persist mode=audiobook on julio-verne if the stored DNA drifted to viral. */
async function healJulioVerneAudiobookMode(): Promise<void> {
  const id = "julio-verne-audiolivro";
  const seed = SEED_CHANNELS.find((c) => c.id === id);
  if (!seed) return;

  if (isSupabaseEnabled()) {
    const { getSupabase, assertNoError } = await import("./supabaseClient");
    const res = await getSupabase().from("channels").select("dna_json").eq("id", id).maybeSingle();
    const row = assertNoError(res) as { dna_json: ChannelDNA | string } | null;
    if (!row) {
      // Channel missing remotely — create from seed so Livros works.
      try {
        await createChannel({
          id: seed.id,
          name: seed.name,
          niche: seed.niche,
          coverColor: seed.coverColor,
          dna: seed.dna,
        });
        // eslint-disable-next-line no-console
        console.log(`[seed] created missing channel ${id}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!/duplicate key|unique constraint/i.test(message)) throw err;
      }
      return;
    }
    const raw = typeof row.dna_json === "string" ? JSON.parse(row.dna_json) : row.dna_json;
    if (raw?.mode === "audiobook") return;
    await updateChannelDna(id, { ...raw, mode: "audiobook" });
    // eslint-disable-next-line no-console
    console.log(`[seed] healed ${id} → mode=audiobook`);
    return;
  }

  const existing = await getChannel(id);
  if (!existing) {
    await createChannel({
      id: seed.id,
      name: seed.name,
      niche: seed.niche,
      coverColor: seed.coverColor,
      dna: seed.dna,
    });
    return;
  }
  // SQLite path: normalizeDna already forces mode; persist if raw file drifted.
  const { getDb } = await import("./db");
  const row = getDb().prepare(`SELECT dna_json FROM channels WHERE id = ?`).get(id) as
    | { dna_json: string }
    | undefined;
  if (!row) return;
  const raw = JSON.parse(row.dna_json) as ChannelDNA;
  if (raw.mode === "audiobook") return;
  await updateChannelDna(id, { ...raw, mode: "audiobook" });
}

/** Pin Amor Amor music standards + 8% volume (Voxscape → Rest Now → Vastness). */
async function healAmorAmorMusicalStandards(): Promise<void> {
  const { DEFAULT_AMOR_AMOR_MUSICAL, AMOR_AMOR_STANDARD_MUSIC_IDS } = await import(
    "./providers/music/musicalDna"
  );
  const id = "amor-amor";
  const existing = await getChannel(id);
  if (!existing) return;

  const musical = existing.dna.musical ?? {};
  const ids = Array.isArray((musical as { standardMusicIds?: string[] }).standardMusicIds)
    ? (musical as { standardMusicIds: string[] }).standardMusicIds
    : [];
  const already =
    ids.length === AMOR_AMOR_STANDARD_MUSIC_IDS.length &&
    AMOR_AMOR_STANDARD_MUSIC_IDS.every((x, i) => ids[i] === x) &&
    Number((musical as { volume?: number }).volume) === 0.08;
  if (already) return;

  await updateChannelDna(id, {
    ...existing.dna,
    musical: {
      ...DEFAULT_AMOR_AMOR_MUSICAL,
      ...musical,
      volume: 0.08,
      standardMusicIds: [...AMOR_AMOR_STANDARD_MUSIC_IDS],
    },
  });
  // eslint-disable-next-line no-console
  console.log("[seed] healed amor-amor musical standards (8% + 3-track rotation)");
}

if (require.main === module) {
  ensureSeeded({ allowRemoteSeed: true }).then(() => console.log("Seed complete."));
}
