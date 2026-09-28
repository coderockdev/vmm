import { ensureSeeded } from "./seed";
import { getChannel } from "./repo/channels";
import { getScriptProvider } from "./providers/script";
import { parseGeneratedScript } from "./scriptLines";
import { synthesizeNarration } from "./pipeline/narration";
import { renderVideoProject } from "./pipeline/render";

async function main() {
  ensureSeeded();
  const channel = getChannel("amor-amor")!;
  const scriptProvider = getScriptProvider();

  const ideas = await scriptProvider.generateContentPlan({
    channel,
    topic: "reconciliación amorosa",
    quantity: 1,
    previousTitles: [],
  });
  const idea = { id: "t", planId: "t", status: "planned" as const, ...ideas[0] };

  const generated = await scriptProvider.generateScript({
    channel,
    topic: "reconciliación amorosa",
    contentIdea: idea,
    durationMinutes: 1,
    previousScripts: [],
  });

  const lines = parseGeneratedScript(generated, channel.dna.scriptRules.pauses);
  console.log(`Script has ${lines.length} lines.`);

  const videoProjectId = `render-test-${Date.now()}`;
  console.log("Synthesizing narration...");
  const narration = await synthesizeNarration({ channel, videoProjectId, lines });
  console.log(`Narration ready: ${narration.durationSeconds.toFixed(2)}s at ${narration.filePath}`);

  console.log("Rendering MP4 via Remotion...");
  const result = await renderVideoProject({
    channel,
    videoProjectId,
    lines: narration.lines,
    seed: 42,
    durationInSeconds: narration.durationSeconds,
    format: "video",
    audioAbsolutePath: narration.filePath,
    onProgress: (p, msg) => console.log(`  [${p}%] ${msg}`),
  });

  console.log("Render complete:", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
