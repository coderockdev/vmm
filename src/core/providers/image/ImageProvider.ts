export type ImageProviderName = "openai" | "pollinations" | "gemini";

export interface GenerateImageArgs {
  prompt: string;
  outPath: string; // absolute file path to write the PNG to
}

export interface GenerateImageResult {
  filePath: string;
}

/**
 * ImageProvider is the seam for AI cover/thumbnail generation — same pattern as
 * ScriptProvider/TTSProvider.
 */
export interface ImageProvider {
  readonly name: ImageProviderName;
  generate(args: GenerateImageArgs): Promise<GenerateImageResult>;
}
