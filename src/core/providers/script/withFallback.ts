import { getScriptProvider, type ScriptProvider, type ScriptProviderName } from "./index";

/** Cheap text models only. Claude is too expensive for an 11-minute prayer. */
const FALLBACK_CHAIN: ScriptProviderName[] = ["openai", "gemini"];

function isBillingQuotaMessage(msg: string): boolean {
  return (
    msg.includes("insufficient_quota") ||
    msg.includes("sem créditos") ||
    msg.includes("billing_not_active") ||
    msg.includes("exceeded your current quota")
  );
}

export function isTransientAiError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (isBillingQuotaMessage(msg)) return false;
  return (
    msg.includes("limite de requisições") ||
    msg.includes("rate limit") ||
    msg.includes("http 429") ||
    msg.includes("429") ||
    msg.includes("sobrecarregado") ||
    msg.includes("indisponível") ||
    msg.includes("high demand") ||
    msg.includes("overloaded") ||
    msg.includes("temporarily") ||
    msg.includes("falha de rede") ||
    msg.includes("try again") ||
    msg.includes("tente de novo")
  );
}

function providerAvailable(name: ScriptProviderName): boolean {
  if (name === "mock") return true;
  if (name === "openai") return Boolean(process.env.OPENAI_API_KEY?.trim());
  if (name === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  if (name === "gemini") return Boolean(process.env.GEMINI_API_KEY?.trim());
  return false;
}

function buildChain(preferred?: string | null): ScriptProviderName[] {
  const requested = (preferred || process.env.AI_PROVIDER || "openai").toLowerCase();
  const start: ScriptProviderName = requested === "gemini" ? "gemini" : "openai";
  const ordered: ScriptProviderName[] = [
    start,
    ...FALLBACK_CHAIN.filter((p) => p !== start),
  ];
  const seen = new Set<string>();
  return ordered.filter((p) => {
    if (seen.has(p)) return false;
    seen.add(p);
    return providerAvailable(p);
  });
}

/** Quota, a dead key, or a transient outage moves ChatGPT → Gemini. Claude is not in this chain. */
function shouldFailover(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (isBillingQuotaMessage(msg)) return true;
  if (
    msg.includes("invalid x-api-key") ||
    msg.includes("authentication_error") ||
    msg.includes("api key not valid") ||
    msg.includes("http 401") ||
    msg.includes("(http 401)")
  ) {
    return true;
  }
  return isTransientAiError(err);
}

/**
 * Run an LLM call with automatic failover across configured providers when
 * the current one is rate-limited, overloaded, or out of credits.
 */
export async function withScriptProviderFallback<T>(args: {
  preferred?: string | null;
  run: (provider: ScriptProvider, name: ScriptProviderName) => Promise<T>;
  onFallback?: (from: ScriptProviderName, to: ScriptProviderName, reason: string) => void;
}): Promise<T> {
  const chain = buildChain(args.preferred);
  if (chain.length === 0) {
    throw new Error("Nenhuma IA barata configurada (OPENAI / GEMINI). Claude não entra neste fluxo.");
  }

  let lastErr: unknown;
  for (let i = 0; i < chain.length; i++) {
    const name = chain[i];
    try {
      return await args.run(getScriptProvider(name), name);
    } catch (err) {
      lastErr = err;
      const next = chain[i + 1];
      if (!next || !shouldFailover(err)) throw err;
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[ai-fallback] ${name} falhou → ${next}:`, reason.slice(0, 160));
      args.onFallback?.(name, next, reason);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
