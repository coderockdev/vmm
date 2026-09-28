import { getChannel, createChannel } from "./repo/channels";
import { SEED_CHANNELS } from "./seedData";
import { reconcileStuckJobs } from "./pipeline/reconcile";

/**
 * Idempotent by design: every page that reads channel data calls this first.
 * With an async DB (Supabase) two requests can both see "not found" before
 * either insert lands, so a duplicate-key error here means someone else won
 * the race — that's success, not a real failure, and is swallowed.
 *
 * Also reconciles any ProductionJob left orphaned by a previous process
 * crash/restart (see pipeline/reconcile.ts) — piggybacking here means every
 * page load gets a sane job list without a dedicated server-startup hook.
 */
export async function ensureSeeded(): Promise<void> {
  await reconcileStuckJobs();
  for (const seed of SEED_CHANNELS) {
    if (await getChannel(seed.id)) continue;
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
  }
}

if (require.main === module) {
  ensureSeeded().then(() => console.log("Seed complete."));
}
