const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRIES = 2;

export type FetchWithRetryOptions = RequestInit & {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
  ) {
    super(`HTTP ${status}: ${url}`);
    this.name = "HttpError";
  }
}

export class RequestTimeoutError extends Error {
  constructor(public readonly url: string) {
    super(`Request timeout: ${url}`);
    this.name = "RequestTimeoutError";
  }
}

export class BotProtectionError extends Error {
  constructor(public readonly url: string) {
    super(`Bot protection page returned by ${url}`);
    this.name = "BotProtectionError";
  }
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryDelayMs = 500,
    headers,
    ...requestInit
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...requestInit,
        cache: "no-store",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/json,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "tr-TR,tr;q=0.9,en;q=0.8",
          "user-agent":
            "Girisim-Atlasi/1.0 (+https://github.com; public ecosystem indexer)",
          ...headers,
        },
      });

      if (!response.ok) {
        const error = new HttpError(response.status, url);
        if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === retries) {
          throw error;
        }
        lastError = error;
      } else {
        return response;
      }
    } catch (error) {
      const normalizedError =
        error instanceof DOMException && error.name === "AbortError"
          ? new RequestTimeoutError(url)
          : error;
      lastError = normalizedError;
      const isLastAttempt = attempt === retries;
      const isRetryable =
        !(normalizedError instanceof HttpError) ||
        RETRYABLE_STATUS_CODES.has(normalizedError.status);

      if (isLastAttempt || !isRetryable) throw normalizedError;
    } finally {
      clearTimeout(timer);
    }

    await wait(retryDelayMs * 2 ** attempt);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Request failed: ${url}`);
}

export async function fetchTextWithRetry(
  url: string,
  options?: FetchWithRetryOptions,
): Promise<string> {
  const response = await fetchWithRetry(url, options);
  const text = await response.text();

  if (
    /<title[^>]*>\s*(just a moment|attention required|access denied|bir dakika lütfen)/i.test(
      text,
    ) ||
    /cf-chl-|challenge-platform|captcha/i.test(text)
  ) {
    throw new BotProtectionError(url);
  }

  return text;
}
