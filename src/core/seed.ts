import { getChannel, createChannel } from "./repo/channels";
import { SEED_CHANNELS } from "./seedData";

export function ensureSeeded() {
  for (const seed of SEED_CHANNELS) {
    if (!getChannel(seed.id)) {
      createChannel({
        id: seed.id,
        name: seed.name,
        niche: seed.niche,
        coverColor: seed.coverColor,
        dna: seed.dna,
      });
      // eslint-disable-next-line no-console
      console.log(`[seed] created channel ${seed.id}`);
    }
  }
}

if (require.main === module) {
  ensureSeeded();
  console.log("Seed complete.");
}
