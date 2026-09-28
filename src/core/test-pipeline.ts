import { ensureSeeded } from "./seed";
import { getChannel } from "./repo/channels";
import { getScriptProvider } from "./providers/script";
import { parseGeneratedScript } from "./scriptLines";
import { synthesizeNarration } from "./pipeline/narration";

async function main() {
  ensureSeeded();

  const scriptProvider = getScriptProvider();

  for (const channelId of ["amor-amor", "oracoes-da-noite"]) {
    const channel = getChannel(channelId)!;
    console.log(`\n=== ${channel.name} (${channel.dna.language}) ===`);

    const ideas = await scriptProvider.generateContentPlan({
      channel,
      topic: channelId === "amor-amor" ? "reconciliação amorosa" : "uma noite difícil",
      quantity: 3,
      previousTitles: [],
    });
    console.log("Content plan ideas:");
    ideas.forEach((idea, i) => console.log(`  ${i + 1}. ${idea.title} — ${idea.angle}`));

    const idea = { id: "test-idea", planId: "test-plan", status: "planned" as const, ...ideas[0] };
    const generated = await scriptProvider.generateScript({
      channel,
      topic: channelId === "amor-amor" ? "reconciliação amorosa" : "uma noite difícil",
      contentIdea: idea,
      durationMinutes: channel.dna.scriptRules.defaultDurationMinutes,
      previousScripts: [],
    });

    const lines = parseGeneratedScript(generated, channel.dna.scriptRules.pauses);
    console.log(`Script lines (${lines.length}):`);
    lines.forEach((l) => console.log(`  [pause ${l.pauseAfter}s]${l.sectionBreak ? " (section)" : ""} ${l.text}`));

    if (channelId === "amor-amor") {
      console.log("Synthesizing narration with LocalTTSProvider...");
      const narration = await synthesizeNarration({
        channel,
        videoProjectId: `pipeline-test-${Date.now()}`,
        lines,
      });
      console.log(`Narration file: ${narration.filePath}`);
      console.log(`Total duration: ${narration.durationSeconds.toFixed(2)}s`);
      narration.lines.forEach((l) =>
        console.log(`  [${l.start.toFixed(2)}-${l.end.toFixed(2)}] ${l.text}`)
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
