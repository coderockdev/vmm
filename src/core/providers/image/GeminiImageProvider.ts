import path from "path";
import fs from "fs";
import { ImageProvider, GenerateImageArgs, GenerateImageResult } from "./ImageProvider";
import { fetchWithRetry, describeProviderError } from "../../httpRetry";

const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";

/**
 * Gemini image generation. Requires GEMINI_API_KEY.
 * Native 16:9, which is the frame the audiobook video uses.
 */
export class GeminiImageProvider implements ImageProvider {
  readonly name = "gemini" as const;

  async generate(args: GenerateImageArgs): Promise<GenerateImageResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set. Add it to .env.local to generate covers with Gemini.");
    }

    const image = await geminiImage(apiKey, MODEL, args.prompt);
    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    fs.writeFileSync(args.outPath, image);
    return { filePath: args.outPath };
  }
}

async function geminiImage(apiKey: string, model: string, prompt: string): Promise<Buffer> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: "16:9" },
      },
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(describeProviderError(`Gemini Images (modelo "${model}")`, res.status, detail));
  }
  const json = await res.json();
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const data = part.inlineData?.data || part.inline_data?.data;
    if (data) return Buffer.from(data, "base64");
  }
  throw new Error("Gemini image response did not include image data.");
}
