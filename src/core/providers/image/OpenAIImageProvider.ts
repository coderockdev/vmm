import fs from "fs";
import path from "path";
import { ImageProvider, GenerateImageArgs, GenerateImageResult } from "./ImageProvider";

const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

/**
 * Real OpenAI Images API integration. Requires OPENAI_API_KEY. Model is
 * configurable via OPENAI_IMAGE_MODEL (default "gpt-image-1") since OpenAI's
 * image model lineup changes — no code edit needed to point at a newer one.
 */
export class OpenAIImageProvider implements ImageProvider {
  readonly name = "openai" as const;

  async generate(args: GenerateImageArgs): Promise<GenerateImageResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set. Add it to your .env.local to generate cover art with AI.");
    }

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        prompt: args.prompt,
        size: "1024x1024",
        n: 1,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `OpenAI image request failed (${response.status}) using model "${MODEL}" — set OPENAI_IMAGE_MODEL in .env.local if your account uses a different image model. Response: ${body.slice(0, 500)}`
      );
    }

    const json = await response.json();
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("OpenAI image response did not include image data.");
    }

    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    fs.writeFileSync(args.outPath, Buffer.from(b64, "base64"));

    return { filePath: args.outPath };
  }
}
