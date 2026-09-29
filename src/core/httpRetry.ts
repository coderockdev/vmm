/**
 * Retries a fetch on transient failures (network blips, 429 rate-limited, 5xx
 * server errors — e.g. "model is currently experiencing high demand") with
 * exponential backoff. AI providers hit this under normal load; a couple of
 * automatic retries turns a flaky request into a successful one without the
 * user needing to click "gerar" again.
 */
/**
 * Turns a raw HTTP failure from an AI provider into a message that tells the
 * user WHOSE fault it is — "Gemini is overloaded, try again" reads very
 * differently from a silent-looking failure, even though today both cases
 * already had *some* error surfaced; this makes that message actually say
 * what's going on instead of just the raw status/body.
 */
function isBillingQuotaError(body: string): boolean {
  const lower = body.toLowerCase();
  return (
    lower.includes("insufficient_quota") ||
    lower.includes("exceeded your current quota") ||
    lower.includes("billing_not_active") ||
    lower.includes("you exceeded your current quota")
  );
}

function isNetworkFetchError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg === "fetch failed" ||
    msg.includes("network") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("socket hang up") ||
    msg.includes("undici")
  );
}

export function describeProviderError(providerLabel: string, status: number, body: string): string {
  if (status === 429 && isBillingQuotaError(body)) {
    return `${providerLabel} sem créditos/quota na conta (HTTP 429 insufficient_quota — não é bug do app). Coloque crédito em platform.openai.com (Billing) ou troque de IA no seletor (Claude/Gemini/Mock).`;
  }
  if (status === 429) {
    return `${providerLabel} atingiu o limite de requisições no momento (não é um erro do app). Espere um pouco e tente de novo, ou troque de IA no seletor.`;
  }
  if (status >= 500) {
    return `${providerLabel} está indisponível/sobrecarregado no momento (erro do próprio provedor, não do app). Tente de novo em alguns segundos, ou troque de IA no seletor.`;
  }
  return `${providerLabel} recusou a requisição (HTTP ${status}): ${body.slice(0, 300)}`;
}

export async function fetchWithRetry(
  input: string,
  init: RequestInit,
  options: { retries?: number; baseDelayMs?: number } = {}
): Promise<Response> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;

  let lastNetworkError: unknown;
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(input, init);
      // Billing/quota 429s never recover with retry — only true rate limits do.
      let billingBlocked = false;
      if (response.status === 429) {
        const peek = await response.clone().text().catch(() => "");
        billingBlocked = isBillingQuotaError(peek);
      }
      const retryable = !billingBlocked && (response.status === 429 || response.status >= 500);
      if (response.ok || !retryable || attempt >= retries) {
        return response;
      }
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
    } catch (err) {
      lastNetworkError = err;
      if (!isNetworkFetchError(err) || attempt >= retries) {
        if (isNetworkFetchError(err)) {
          throw new Error(
            `Falha de rede ao falar com a IA (${err instanceof Error ? err.message : "fetch failed"}). Verifique a internet e tente de novo.`
          );
        }
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
    }
  }
  // Unreachable, but keeps TS happy if the loop shape changes.
  throw lastNetworkError instanceof Error
    ? lastNetworkError
    : new Error("Falha de rede ao falar com a IA.");
}
