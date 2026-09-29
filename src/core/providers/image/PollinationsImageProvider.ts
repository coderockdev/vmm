import path from "path";
import fs from "fs";
import { ImageProvider, GenerateImageArgs, GenerateImageResult, ImageProviderName } from "./ImageProvider";
import { fetchWithRetry, describeProviderError } from "../../httpRetry";

export type PollinationsModel = "flux" | "turbo" | "gptimage";

const MODEL_BY_NAME: Record<string, PollinationsModel> = {
  pollinations: "flux",
  "pollinations-turbo": "turbo",
  "pollinations-gptimage": "gptimage",
};

/**
 * Free image generation via Pollinations (no API key).
 * Supports multiple free models for variety / quality tradeoffs.
 */
export class PollinationsImageProvider implements ImageProvider {
  readonly name: ImageProviderName;
  private readonly model: PollinationsModel;

  constructor(modelOrName: PollinationsModel | ImageProviderName = "flux") {
    if (modelOrName === "flux" || modelOrName === "turbo" || modelOrName === "gptimage") {
      this.model = modelOrName;
      this.name =
        modelOrName === "flux"
          ? "pollinations"
          : modelOrName === "turbo"
            ? "pollinations-turbo"
            : "pollinations-gptimage";
      return;
    }
    this.model = MODEL_BY_NAME[modelOrName] ?? "flux";
    this.name = (MODEL_BY_NAME[modelOrName] ? modelOrName : "pollinations") as ImageProviderName;
  }

  async generate(args: GenerateImageArgs): Promise<GenerateImageResult> {
    const prompt = encodeURIComponent(args.prompt.slice(0, 1800));
    const seed = Math.floor(Math.random() * 1_000_000);
    // Prefer the unified gen endpoint; fall back to legacy image host.
    const query = `width=1280&height=720&nologo=true&enhance=true&model=${this.model}&seed=${seed}`;
    const urls = [
      `https://gen.pollinations.ai/image/${prompt}?${query}`,
      `https://image.pollinations.ai/prompt/${prompt}?${query}`,
    ];

    let lastError: Error | null = null;
    for (const url of urls) {
      try {
        const response = await fetchWithRetry(url, { method: "GET" }, { retries: 1 });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          lastError = new Error(
            describeProviderError(`Pollinations (${this.model})`, response.status, body)
          );
          continue;
        }
        const buf = Buffer.from(await response.arrayBuffer());
        if (buf.length < 1000) {
          lastError = new Error(`Pollinations (${this.model}) returned an empty/invalid image.`);
          continue;
        }
        fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
        fs.writeFileSync(args.outPath, buf);
        return { filePath: args.outPath };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
    throw lastError ?? new Error(`Pollinations (${this.model}) failed.`);
  }
}
