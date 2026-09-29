/**
 * Merge Amor Amor successful titles into the live channel DNA (Supabase/local).
 * Usage: npx tsx scripts/sync-amor-amor-successful-titles.ts
 */
import { getChannel, updateChannelDna } from "../src/core/repo/channels";
import { AMOR_AMOR_SUCCESSFUL_TITLES } from "../src/core/channels/amorAmorSuccessfulTitles";

async function main() {
  const channel = await getChannel("amor-amor");
  if (!channel) {
    console.error("Channel amor-amor not found");
    process.exit(1);
  }
  const next = {
    ...channel.dna,
    successfulTitles: [...AMOR_AMOR_SUCCESSFUL_TITLES],
  };
  await updateChannelDna(channel.id, next);
  console.log(
    `Updated amor-amor DNA with ${next.successfulTitles.length} successful titles.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
