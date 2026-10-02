export type ImageProviderName =
  | "openai"
  | "gemini"
  | "pollinations"
  | "pollinations-turbo"
  | "pollinations-gptimage";

export interface GenerateImageArgs {
  prompt: string;
  outPath: string; // absolute file path to write the PNG to
  /** GPT Image quality. Omitted quality lets the API pick high and the bill jumps. */
  quality?: "low" | "medium" | "high";
  /** Desired frame. gpt-image-1 only accepts 1024x1024, 1536x1024 and 1024x1536. */
  size?: string;
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
