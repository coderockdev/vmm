import { ScriptProvider } from "./ScriptProvider";
import { MockScriptProvider } from "./MockScriptProvider";
import { ClaudeScriptProvider } from "./ClaudeScriptProvider";
import { OpenAIScriptProvider } from "./OpenAIScriptProvider";
import { GeminiScriptProvider } from "./GeminiScriptProvider";

export * from "./ScriptProvider";

export type ScriptProviderName = "mock" | "anthropic" | "openai" | "gemini";

/**
 * AI_PROVIDER env var selects the default backend; an explicit `override`
 * (from a per-generation choice in the UI) always wins. Nothing else in the
 * app should import a concrete provider class directly — always go through
 * getScriptProvider() so swapping/comparing providers never touches call
 * sites.
 */
export function getScriptProvider(override?: string | null): ScriptProvider {
  const provider = (override || process.env.AI_PROVIDER || "mock").toLowerCase();

  switch (provider) {
    case "mock":
      return new MockScriptProvider();
    case "anthropic":
      return new ClaudeScriptProvider();
    case "openai":
      return new OpenAIScriptProvider();
    case "gemini":
      return new GeminiScriptProvider();
    default:
      console.warn(`[ScriptProvider] AI_PROVIDER="${provider}" not implemented yet, falling back to mock.`);
      return new MockScriptProvider();
  }
}
