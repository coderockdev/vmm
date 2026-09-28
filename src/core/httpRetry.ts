/**
 * Retries a fetch on transient failures (429 rate-limited, 5xx server
 * errors — e.g. "model is currently experiencing high demand") with
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
export function describeProviderError(providerLabel: string, status: number, body: string): string {
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
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 1000;

  let response: Response;
  for (let attempt = 0; ; attempt++) {
    response = await fetch(input, init);
    const retryable = response.status === 429 || response.status >= 500;
    if (response.ok || !retryable || attempt >= retries) {
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
  }
}
