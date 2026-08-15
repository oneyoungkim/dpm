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

export async function fetchJson<T>(
  url: string,
  headers: Record<string, string> = {},
): Promise<T | null> {
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", ...headers },
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      const last = attempt === RETRIES;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`   ! ${last ? "포기" : "재시도"} (${attempt}/${RETRIES}) ${msg}\n     ${url}`);
      if (last) return null;
      await sleep(attempt * 1000); // 상대 서버를 두들기지 않도록 점점 늦게
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export async function fetchText(
  url: string,
  headers: Record<string, string> = {},
): Promise<string | null> {
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", ...headers },
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      const last = attempt === RETRIES;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`   ! ${last ? "포기" : "재시도"} (${attempt}/${RETRIES}) ${msg}\n     ${url}`);
      if (last) return null;
      await sleep(attempt * 1000);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
