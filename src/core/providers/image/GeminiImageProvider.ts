import path from "path";
import fs from "fs";
import { ImageProvider, GenerateImageArgs, GenerateImageResult } from "./ImageProvider";
import { fetchWithRetry, describeProviderError } from "../../httpRetry";

const MODEL = process.env.GEMINI_IMAGE_MODEL || "imagen-3.0-generate-002";

/**
 * Gemini / Imagen image generation. Requires GEMINI_API_KEY.
 * Falls back to a clear error if the model endpoint rejects the request.
 */
export class GeminiImageProvider implements ImageProvider {
  readonly name = "gemini" as const;

  async generate(args: GenerateImageArgs): Promise<GenerateImageResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set. Add it to .env.local to generate covers with Gemini.");
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predict?key=${apiKey}`;
    const response = await fetchWithRetry(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: args.prompt }],
        parameters: { sampleCount: 1, aspectRatio: "16:9" },
      }),
    });

    if (!response.ok) {
      // Try Gemini 2.0 flash image generation as alternate path
      const alt = await tryGeminiFlashImage(apiKey, args.prompt);
      if (alt) {
        fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
        fs.writeFileSync(args.outPath, alt);
        return { filePath: args.outPath };
      }
      const body = await response.text().catch(() => "");
      throw new Error(describeProviderError(`Gemini Images (modelo "${MODEL}")`, response.status, body));
    }

    const json = await response.json();
    const b64 =
      json.predictions?.[0]?.bytesBase64Encoded ||
      json.predictions?.[0]?.image?.imageBytes ||
      null;
    if (!b64) throw new Error("Gemini image response did not include image data.");
    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    fs.writeFileSync(args.outPath, Buffer.from(b64, "base64"));
    return { filePath: args.outPath };
  }
}

async function tryGeminiFlashImage(apiKey: string, prompt: string): Promise<Buffer | null> {
  const model = process.env.GEMINI_FLASH_IMAGE_MODEL || "gemini-3.1-flash-image";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const data = part.inlineData?.data || part.inline_data?.data;
    if (data) return Buffer.from(data, "base64");
  }
  return null;
}
