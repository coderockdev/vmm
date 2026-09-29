import path from "path";
import fs from "fs";
import { ImageProvider, GenerateImageArgs, GenerateImageResult } from "./ImageProvider";
import { fetchWithRetry, describeProviderError } from "../../httpRetry";

/**
 * Free image generation via Pollinations (no API key). Good default for
 * thumbnail drafts when OpenAI/Gemini keys are missing or to save cost.
 */
export class PollinationsImageProvider implements ImageProvider {
  readonly name = "pollinations" as const;

  async generate(args: GenerateImageArgs): Promise<GenerateImageResult> {
    const prompt = encodeURIComponent(args.prompt.slice(0, 1800));
    const url = `https://image.pollinations.ai/prompt/${prompt}?width=1280&height=720&nologo=true&enhance=true`;
    const response = await fetchWithRetry(url, { method: "GET" }, { retries: 2 });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(describeProviderError("Pollinations", response.status, body));
    }
    const buf = Buffer.from(await response.arrayBuffer());
    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    fs.writeFileSync(args.outPath, buf);
    return { filePath: args.outPath };
  }
}
