/**
 * 커뮤니티 목록 페이지 전용 fetch.
 * scripts/http.ts 의 fetchText 는 UTF-8만 읽고 Accept 에 *\/* 가 없어 일부 서버(보배드림)가 406을 준다.
 * 그래서 같은 재시도·타임아웃 방식으로 따로 둔다:
 *  - robots.txt 를 먼저 읽고 막힌 경로는 요청하지 않는다
 *  - 같은 호스트 요청 사이 최소 1.5초(robots 의 Crawl-delay 가 더 길면 그것)
 *  - 응답 바이트를 charset(헤더 → meta)대로 디코딩한다(EUC-KR 사이트 대비)
 */

import { isAllowed, loadRobots, type Robots } from "./robots";

// scripts/http.ts 와 같은 일반 브라우저 UA. 사람·프로젝트 이름을 넣지 않는다.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const TIMEOUT_MS = 20_000;
const RETRIES = 3;
const MIN_GAP_MS = 1_500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const lastHit = new Map<string, number>();
const robotsCache = new Map<string, Promise<Robots | null>>();

export const BASE_HEADERS: Record<string, string> = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.5",
};

function charsetOf(contentType: string | null, bytes: Uint8Array): string {
  const fromHeader = contentType?.match(/charset=["']?([\w-]+)/i)?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  // 헤더에 없으면 문서 앞부분의 meta 를 본다(ASCII 범위라 latin1로 읽어도 된다)
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const fromMeta = head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  return (fromMeta ?? "utf-8").toLowerCase();
}

function decode(bytes: Uint8Array, charset: string): string {
  const label = charset === "ks_c_5601-1987" || charset === "cp949" ? "euc-kr" : charset;
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

async function rawGet(url: string, headers: Record<string, string>): Promise<{ status: number; text: string }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { ...BASE_HEADERS, ...headers }, signal: ac.signal, redirect: "follow" });
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { status: res.status, text: decode(bytes, charsetOf(res.headers.get("content-type"), bytes)) };
  } finally {
    clearTimeout(timer);
  }
}

function robotsFor(origin: string): Promise<Robots | null> {
  let pending = robotsCache.get(origin);
  if (!pending) {
    pending = loadRobots(origin, async (url) => {
      try {
        return await rawGet(url, {});
      } catch {
        return null;
      }
    });
    robotsCache.set(origin, pending);
  }
  return pending;
}

/** robots.txt 가 이 주소를 허락하는지. robots.txt 를 못 읽으면(5xx·네트워크) 막힌 것으로 본다. */
export async function allowedByRobots(url: string): Promise<{ allowed: boolean; delayMs: number; reason?: string }> {
  const { origin, pathname, search } = new URL(url);
  const robots = await robotsFor(origin);
  if (!robots) return { allowed: false, delayMs: MIN_GAP_MS, reason: "robots.txt 를 읽지 못함" };
  const allowed = isAllowed(robots, pathname + search);
  return {
    allowed,
    delayMs: Math.max(MIN_GAP_MS, (robots.crawlDelay ?? 0) * 1000),
    reason: allowed ? undefined : "robots.txt 금지 경로",
  };
}

/**
 * 목록 페이지 하나를 받는다. 실패하면 이유를 담아 던진다(소스 단위로 잡아서 계속 간다).
 */
export async function fetchListPage(url: string, headers: Record<string, string> = {}): Promise<string> {
  const verdict = await allowedByRobots(url);
  if (!verdict.allowed) throw new Error(`${verdict.reason}: ${url}`);

  const host = new URL(url).host;
  let lastError = "";
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    // 같은 호스트는 요청 사이를 띄운다(재시도 포함)
    const wait = (lastHit.get(host) ?? 0) + verdict.delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastHit.set(host, Date.now());
    try {
      const { status, text } = await rawGet(url, headers);
      if (status === 403 || status === 404 || status === 406 || status === 451) {
        // 막힌 것은 다시 두드려도 소용없다
        throw Object.assign(new Error(`HTTP ${status}`), { fatal: true });
      }
      if (status >= 400) throw new Error(`HTTP ${status}`);
      if (/<title>\s*Just a moment\.\.\./i.test(text)) {
        throw Object.assign(new Error("클라우드플레어 확인 화면"), { fatal: true });
      }
      return text;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      const fatal = (err as { fatal?: boolean }).fatal === true;
      const last = fatal || attempt === RETRIES;
      console.warn(`   ! ${last ? "포기" : "재시도"} (${attempt}/${RETRIES}) ${lastError}\n     ${url}`);
      if (last) break;
      await sleep(attempt * 1000);
    }
  }
  throw new Error(lastError || "알 수 없는 실패");
}
