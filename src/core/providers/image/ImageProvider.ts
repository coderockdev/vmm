export type ImageProviderName = "openai";

export interface GenerateImageArgs {
  prompt: string;
  outPath: string; // absolute file path to write the PNG to
}

export interface GenerateImageResult {
  filePath: string;
}

/**
 * ImageProvider is the seam for AI cover-art generation — same pattern as
 * ScriptProvider/TTSProvider. Today only OpenAI is implemented; swapping in
 * Stability/Gemini/etc later means adding a class here, nothing else changes.
 */
export interface ImageProvider {
  readonly name: ImageProviderName;
  generate(args: GenerateImageArgs): Promise<GenerateImageResult>;
}
