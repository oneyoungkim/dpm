/**
 * 새 글·고친 글 주소를 IndexNow로 알린다(네이버·빙 등 참여 검색엔진이 함께 받는다).
 *
 *   npm run seo:indexnow -- https://gak.gg/magazine/<slug>   # 주소를 골라 알리기
 *   npm run seo:indexnow                                      # 최근 48시간 글 전부
 *   npm run seo:indexnow -- --dry                             # 보내지 않고 보낼 내용만 출력
 *
 * 키: 환경 변수 INDEXNOW_KEY(영문·숫자·하이픈 8~128자). 셸에 없으면 .env.local 에서 한 번 찾는다.
 * 사이트는 같은 키를 /indexnow-key.txt 로 내주고(app/indexnow-key.txt/route.ts), 알릴 때 그 주소를 keyLocation 으로 넘긴다.
 * 키가 없으면 안내만 하고 0으로 끝낸다(발행 흐름을 막지 않는다).
 * 바깥으로 나가는 요청에는 사이트 주소·키·글 주소만 싣는다. 사람 이름·이메일은 넣지 않는다.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

const ENDPOINT = "https://api.indexnow.org/indexnow";
const USER_AGENT = "gak.gg-indexnow/1.0";
const KEY_PATTERN = /^[a-zA-Z0-9-]{8,128}$/;
const TIMEOUT_MS = 15_000;

function loadLocalEnv(): void {
  if (process.env.INDEXNOW_KEY) return;
  const file = join(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  try {
    // 이미 셸에 있는 값은 덮어쓰지 않는다.
    process.loadEnvFile(file);
  } catch {
    // 읽지 못하면 셸 환경만 쓴다.
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

const STATUS_NOTE: Record<number, string> = {
  200: "받음",
  202: "받음(키 확인 대기)",
  400: "요청 형식이 틀림",
  403: "키가 맞지 않음(키 파일 주소와 내용을 확인)",
  422: "주소가 이 사이트(host) 것이 아니거나 키와 맞지 않음",
  429: "너무 자주 보냄(잠시 뒤 다시)",
};

async function main(): Promise<number> {
  loadLocalEnv();
  // 환경을 읽은 뒤에 불러야 NEXT_PUBLIC_SITE_URL 이 주소에 반영된다.
  const { BRAND, absoluteUrl } = await import("../../lib/brand");
  const { recentArticles } = await import("../../lib/articles");

  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const inputs = args.filter((arg) => !arg.startsWith("--"));

  const key = process.env.INDEXNOW_KEY?.trim() ?? "";
  if (!KEY_PATTERN.test(key)) {
    console.log(
      [
        "[indexnow] INDEXNOW_KEY 가 없어 건너뜁니다.",
        "  켜려면: 영문·숫자 32자 정도의 키를 하나 만들어(예: openssl rand -hex 16)",
        "  1) 버셀 환경 변수 INDEXNOW_KEY 에 넣고 다시 배포 → https://<사이트>/indexnow-key.txt 에 키가 보이는지 확인",
        "  2) 이 스크립트를 돌리는 곳의 셸 환경이나 .env.local 에도 같은 값을 넣는다.",
      ].join("\n"),
    );
    return 0;
  }

  const site = new URL(BRAND.url);
  const urls = [
    ...new Set(
      (inputs.length > 0
        ? inputs.map((input) => (input.startsWith("/") ? absoluteUrl(input) : input))
        : recentArticles(48).map((article) => absoluteUrl(`/magazine/${article.slug}`))
      ).filter((url) => {
        try {
          const parsed = new URL(url);
          if (parsed.host === site.host && parsed.protocol === site.protocol) return true;
        } catch {
          // 아래에서 알린다.
        }
        console.warn(`[indexnow] ${site.host} 주소가 아니라 뺍니다: ${url}`);
        return false;
      }),
    ),
  ].slice(0, 10_000);

  if (urls.length === 0) {
    console.log(inputs.length > 0 ? "[indexnow] 알릴 주소가 없습니다." : "[indexnow] 최근 48시간 안에 낸 글이 없습니다.");
    return 0;
  }

  const keyLocation = absoluteUrl("/indexnow-key.txt");
  const payload = { host: site.host, key, keyLocation, urlList: urls };

  if (dry) {
    console.log(`[indexnow] --dry: 보내지 않습니다. POST ${ENDPOINT}`);
    console.log(JSON.stringify({ ...payload, key: `${key.slice(0, 4)}…(${key.length}자)` }, null, 2));
    return 0;
  }

  // 키 파일이 배포돼 있지 않으면 받는 쪽이 403을 낸다. 먼저 확인해서 이유를 분명히 알린다.
  try {
    const res = await fetchWithTimeout(keyLocation, { headers: { "User-Agent": USER_AGENT } });
    const body = res.ok ? (await res.text()).trim() : "";
    if (body !== key) {
      console.error(
        `[indexnow] ${keyLocation} 의 내용이 INDEXNOW_KEY 와 다릅니다(HTTP ${res.status}). ` +
          "버셀 환경 변수와 배포를 확인한 뒤 다시 돌리세요.",
      );
      return 1;
    }
  } catch (error) {
    console.error(`[indexnow] 키 파일을 읽지 못했습니다: ${error instanceof Error ? error.message : error}`);
    return 1;
  }

  // 예약 발행 글은 시각이 지나야 페이지가 열린다. 아직 안 열린 주소는 알리지 않는다(검색엔진이 404를 받지 않게).
  const live: string[] = [];
  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
      await res.body?.cancel();
      if (res.ok) live.push(url);
      else console.warn(`[indexnow] 아직 열리지 않아 뺍니다(HTTP ${res.status}): ${url}`);
    } catch (error) {
      console.warn(`[indexnow] 확인하지 못해 뺍니다: ${url} (${error instanceof Error ? error.message : error})`);
    }
  }
  if (live.length === 0) {
    console.log("[indexnow] 열린 주소가 없어 보내지 않습니다. 배포·발행 시각이 지난 뒤 다시 돌리세요.");
    return 0;
  }

  try {
    const res = await fetchWithTimeout(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "User-Agent": USER_AGENT },
      body: JSON.stringify({ ...payload, urlList: live }),
    });
    const note = STATUS_NOTE[res.status] ?? "알 수 없는 응답";
    console.log(`[indexnow] HTTP ${res.status} ${note} · 주소 ${live.length}개`);
    for (const url of live) console.log(`  ${url}`);
    return res.status === 200 || res.status === 202 ? 0 : 1;
  } catch (error) {
    console.error(`[indexnow] 보내지 못했습니다: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}

main().then((code) => process.exit(code));
