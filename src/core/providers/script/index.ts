import { ScriptProvider } from "./ScriptProvider";
import { MockScriptProvider } from "./MockScriptProvider";

export * from "./ScriptProvider";

/**
 * AI_PROVIDER env var selects the backend. Nothing else in the app should
 * import MockScriptProvider (or any future ClaudeScriptProvider /
 * OpenAIScriptProvider / GeminiScriptProvider) directly — always go through
 * getScriptProvider() so swapping providers never touches call sites.
 */
export function getScriptProvider(): ScriptProvider {
  const provider = (process.env.AI_PROVIDER ?? "mock").toLowerCase();

  switch (provider) {
    case "mock":
      return new MockScriptProvider();
    // case "anthropic": return new ClaudeScriptProvider();
    // case "openai": return new OpenAIScriptProvider();
    // case "gemini": return new GeminiScriptProvider();
    default:
      console.warn(`[ScriptProvider] AI_PROVIDER="${provider}" not implemented yet, falling back to mock.`);
      return new MockScriptProvider();
  }
}
