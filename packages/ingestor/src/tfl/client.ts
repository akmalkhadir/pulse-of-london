export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface TflClientOptions {
  appKey: string;
  baseUrl?: string;
  fetchFn?: FetchFn;
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class TflHttpError extends Error {
  constructor(
    public readonly status: number,
    path: string,
  ) {
    super(`TfL ${status} for ${path}`);
    this.name = "TflHttpError";
  }
}

export class TflClient {
  private readonly appKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchFn;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;

  constructor(opts: TflClientOptions) {
    this.appKey = opts.appKey;
    this.baseUrl = opts.baseUrl ?? "https://api.tfl.gov.uk";
    this.fetchFn = opts.fetchFn ?? ((u, i) => fetch(u, i));
    this.retries = opts.retries ?? 2;
    this.retryDelayMs = opts.retryDelayMs ?? 500;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  private buildUrl(path: string, query: Record<string, string> = {}): string {
    const params = new URLSearchParams({ ...query, app_key: this.appKey });
    return `${this.baseUrl}${path}?${params.toString()}`;
  }

  async getJson<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    const url = this.buildUrl(path, query);
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const res = await this.fetchFn(url, { signal: ctrl.signal });
        if (res.ok) return (await res.json()) as T;
        const httpErr = new TflHttpError(res.status, path);
        // 4xx: caller error, do not retry.
        if (res.status >= 400 && res.status < 500) throw httpErr;
        lastErr = httpErr; // 5xx: retry
      } catch (err) {
        if (err instanceof TflHttpError && err.status >= 400 && err.status < 500) {
          throw err;
        }
        lastErr = err;
      } finally {
        clearTimeout(timer);
      }
      if (attempt < this.retries) await sleep(this.retryDelayMs);
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}
