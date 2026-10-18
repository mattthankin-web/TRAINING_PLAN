// Small fetch wrapper shared by the API clients: JSON in/out, a timeout, and
// polite retries on rate limits and transient server errors.

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    public body: string
  ) {
    super(`HTTP ${status} from ${url}: ${body.slice(0, 300)}`);
  }
}

const MAX_ATTEMPTS = 4;

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    if (res.ok) {
      const text = await res.text();
      return (text ? JSON.parse(text) : null) as T;
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      throw new HttpError(res.status, url, await res.text());
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
    await new Promise((r) => setTimeout(r, Math.min(delayMs, 60_000)));
  }
}
