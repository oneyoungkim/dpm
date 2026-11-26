/**
 * 크롤러 공용 fetch.
 * 외부 사이트는 언제든 죽거나 느려지므로, 여기서 재시도와 타임아웃을 다 흡수하고
 * 최종 실패는 null로 돌려준다 — 소스 하나가 죽어도 나머지 수집은 계속돼야 한다.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const TIMEOUT_MS = 20_000;
const RETRIES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 다시 보내도 결과가 같은 응답(403·404 등)은 바로 포기한다.
 * 429·5xx·네트워크 오류만 재시도한다 — 막힌 곳을 세 번씩 두들기지 않으려고.
 */
class HttpError extends Error {
  constructor(
    readonly status: number,
    /** 429 응답의 Retry-After(초). 없으면 undefined */
    readonly retryAfter?: number,
  ) {
    super(`HTTP ${status}`);
  }
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

async function withRetry<T>(
  url: string,
  accept: string,
  headers: Record<string, string>,
  read: (res: Response) => Promise<T>,
): Promise<T | null> {
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept, ...headers },
        signal: ac.signal,
      });
      if (!res.ok) {
        const after = Number(res.headers.get("retry-after"));
        throw new HttpError(res.status, Number.isFinite(after) && after > 0 ? after : undefined);
      }
      return await read(res);
    } catch (err) {
      const giveUp = attempt === RETRIES || (err instanceof HttpError && !err.retryable);
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`   ! ${giveUp ? "포기" : "재시도"} (${attempt}/${RETRIES}) ${msg}\n     ${url}`);
      if (giveUp) return null;
      // 상대 서버를 두들기지 않도록 점점 늦게. 429(요청 한도)는 Retry-After가 짧게 와도 30초~90초 쉰다.
      const wait =
        err instanceof HttpError && err.status === 429
          ? Math.min(Math.max(err.retryAfter ?? 60, 30), 90) * 1000
          : attempt * 1000;
      await sleep(wait);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export async function fetchJson<T>(
  url: string,
  headers: Record<string, string> = {},
): Promise<T | null> {
  return withRetry(url, "application/json", headers, async (res) => (await res.json()) as T);
}

export async function fetchText(
  url: string,
  headers: Record<string, string> = {},
): Promise<string | null> {
  return withRetry(url, "text/html,application/xhtml+xml", headers, (res) => res.text());
}
