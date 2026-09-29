import { getChannel, createChannel, updateChannelDna } from "./repo/channels";
import { SEED_CHANNELS } from "./seedData";
import { reconcileStuckJobs } from "./pipeline/reconcile";
import { isSupabaseEnabled } from "./supabaseClient";

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

if (require.main === module) {
  ensureSeeded({ allowRemoteSeed: true }).then(() => console.log("Seed complete."));
}
