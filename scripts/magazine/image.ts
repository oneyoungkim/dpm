import { articleImageSchema, IMAGE_LICENSES, type ArticleImage } from "../../lib/articles";

/**
 * 위키미디어 공용(Commons)에서 글 표지 사진 후보를 찾는다.
 *
 *   npm run magazine:image -- "Charles Oliveira"
 *   npm run magazine:image -- "Charles Oliveira" --limit 3
 *
 * 이용 허락이 lib/articles.ts 의 IMAGE_LICENSES 안에 들고, 가로 1,200px 이상인 사진만 남긴다.
 * 결과는 머리말 image 에 그대로 넣을 수 있는 JSON이다(가로형 → 검색 순위 순).
 * alt 는 Commons 설명(대개 영어)을 옮긴 것이므로 쓰는 사람이 한국어로 고쳐 넣는다.
 * 요청은 한 번, 쓸 만한 것이 없으면 다음 쪽까지 최대 두 번만 보낸다.
 */

const API = "https://commons.wikimedia.org/w/api.php";
// 사람 이름·이메일·프로젝트 이름을 넣지 않는다
const UA = "license-filtered-image-search/1.0 (Node.js fetch)";
const MIN_WIDTH = 1200;
/** 이보다 큰 원본은 이 폭의 축소본 주소를 쓴다(원본은 수십 MB인 경우가 있다). Commons 표준 축소 폭이라 크기가 그대로 맞는다 */
const SERVE_WIDTH = 1920;
const PAGE_SIZE = 40;
const TIMEOUT_MS = 20_000;

interface ExtValue {
  value?: string;
}

interface ImageInfo {
  url: string;
  descriptionurl: string;
  width: number;
  height: number;
  mime: string;
  thumburl?: string;
  thumbwidth?: number;
  thumbheight?: number;
  extmetadata?: Record<string, ExtValue | undefined>;
}

interface Page {
  title: string;
  index?: number;
  imageinfo?: ImageInfo[];
}

interface ApiResponse {
  query?: { pages?: Page[] };
  continue?: { gsroffset?: number };
}

interface Candidate {
  image: ArticleImage;
  /** 사람이 볼 것: 파일 이름, 원본 크기, 주의 */
  file: string;
  original: { width: number; height: number };
  notes: string[];
  rank: number;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

/** Commons 메타데이터의 HTML을 걷어 낸 한 줄 글 */
export function stripHtml(html: string | undefined): string {
  if (!html) return "";
  return decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

const norm = (s: string) => s.toUpperCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
const LICENSE_BY_NORM = new Map(IMAGE_LICENSES.map((l) => [norm(l), l]));

/** Commons의 이용 허락 이름을 IMAGE_LICENSES 값으로. 목록 밖이면 null */
export function toAllowedLicense(meta: Record<string, ExtValue | undefined>): (typeof IMAGE_LICENSES)[number] | null {
  const short = stripHtml(meta.LicenseShortName?.value);
  const code = stripHtml(meta.License?.value); // "cc-by-sa-4.0", "pd", "cc0"
  for (const raw of [short, code]) {
    if (!raw) continue;
    const n = norm(raw);
    if (LICENSE_BY_NORM.has(n)) return LICENSE_BY_NORM.get(n)!;
    if (n === "PD" || n.startsWith("PUBLIC DOMAIN")) return "Public domain";
    if (n === "CC0 1.0" || n === "CC ZERO") return "CC0";
  }
  return null;
}

async function search(query: string, offset: number): Promise<ApiResponse | null> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: String(PAGE_SIZE),
    gsroffset: String(offset),
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: String(SERVE_WIDTH),
    iiextmetadatafilter: "LicenseShortName|License|Artist|Credit|ImageDescription|ObjectName|Restrictions",
    iiextmetadatalanguage: "en",
  });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}?${params}`, {
      headers: { "User-Agent": UA, "Api-User-Agent": UA, Accept: "application/json" },
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ApiResponse;
  } catch (error) {
    console.error(`위키미디어 공용 요청 실패: ${error instanceof Error ? error.message : error}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function toCandidate(page: Page, rejected: Map<string, number>): Candidate | null {
  const info = page.imageinfo?.[0];
  const reject = (why: string) => {
    rejected.set(why, (rejected.get(why) ?? 0) + 1);
    return null;
  };
  if (!info) return reject("정보 없음");
  if (!/^image\/(jpeg|png|webp)$/.test(info.mime)) return reject(`형식 ${info.mime}`);
  if (info.width < MIN_WIDTH) return reject(`가로 ${MIN_WIDTH}px 미만`);
  const meta = info.extmetadata ?? {};
  const license = toAllowedLicense(meta);
  if (!license) return reject(`이용 허락 목록 밖(${stripHtml(meta.LicenseShortName?.value) || "표기 없음"})`);
  // "Public domain" 표기에는 미국에서만 저작권이 끝난 옛 보도 사진(PD-US-no notice 등)이 섞여 있다.
  // 한국에서는 보호될 수 있어 자동으로는 쓰지 않는다. 사람이 근거를 확인했을 때만 --allow-pd 로 연다.
  if (license === "Public domain" && !process.argv.includes("--allow-pd")) {
    return reject("퍼블릭 도메인 표기(나라별 근거 확인 필요, --allow-pd)");
  }

  const artist = stripHtml(meta.Artist?.value) || stripHtml(meta.Credit?.value);
  if (!artist) return reject("저작자 표기 없음");
  const notes: string[] = [];
  if (/unknown|anonymous|미상/i.test(artist)) notes.push("저작자 미상으로 표기된 사진");
  const restrictions = stripHtml(meta.Restrictions?.value);
  if (restrictions) notes.push(`Commons 제한 표시: ${restrictions}(초상권·상표 등, 광고처럼 쓰지 않으면 대개 괜찮지만 확인)`);

  const useThumb = info.width > SERVE_WIDTH && info.thumburl && info.thumbwidth && info.thumbheight;
  const fileName = page.title.replace(/^File:/, "");
  const description = stripHtml(meta.ImageDescription?.value) || stripHtml(meta.ObjectName?.value) || fileName.replace(/\.[a-z0-9]+$/i, "");
  const alt = description.length > 120 ? `${description.slice(0, 117)}…` : description;
  notes.push("alt는 Commons 설명을 옮긴 것: 한국어로 고쳐 쓴다");

  const image = {
    // 축소본 주소 뒤에 붙는 추적용 utm 값은 뗀다
    url: useThumb ? info.thumburl!.replace(/\?.*$/, "") : info.url,
    credit: `사진: ${artist.length > 80 ? `${artist.slice(0, 77)}…` : artist} / Wikimedia Commons`,
    license,
    sourceUrl: info.descriptionurl,
    alt,
    width: useThumb ? info.thumbwidth! : info.width,
    height: useThumb ? info.thumbheight! : info.height,
  };
  const parsed = articleImageSchema.safeParse(image);
  if (!parsed.success) return reject(`머리말 형식 불일치(${parsed.error.issues[0]?.message})`);

  // 가로형 먼저, 그다음 검색 순위, 비율이 16:9~3:2에서 멀수록 조금 뒤로
  const ratio = info.width / info.height;
  const landscape = ratio >= 1.2;
  const rank = (landscape ? 0 : 1000) + (page.index ?? 99) + Math.min(Math.abs(ratio - 1.6) * 5, 10);
  return { image: parsed.data, file: fileName, original: { width: info.width, height: info.height }, notes, rank };
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Math.max(1, Number(args[limitIdx + 1]) || 5) : 5;
  // --limit 이 없으면 limitIdx 는 -1 이다. 그때 0번 인자(검색어)를 빼지 않도록 따로 본다.
  const query = args
    .filter((a, i) => !a.startsWith("--") && (limitIdx < 0 || i !== limitIdx + 1))
    .join(" ")
    .trim();
  if (!query) {
    console.error('사용법: npm run magazine:image -- "검색어" [--limit 5]');
    process.exit(1);
  }

  const rejected = new Map<string, number>();
  const candidates: Candidate[] = [];
  let offset = 0;
  let requests = 0;
  // 쓸 만한 것이 없을 때만 다음 쪽을 한 번 더 본다(요청은 최대 2번)
  while (requests < 2 && candidates.length === 0) {
    const data = await search(query, offset);
    requests++;
    const pages = data?.query?.pages ?? [];
    for (const page of pages) {
      const candidate = toCandidate(page, rejected);
      if (candidate) candidates.push(candidate);
    }
    if (!data?.continue?.gsroffset) break;
    offset = data.continue.gsroffset;
  }

  candidates.sort((a, b) => a.rank - b.rank);
  const top = candidates.slice(0, limit);
  console.log(
    JSON.stringify(
      {
        query,
        requests,
        found: candidates.length,
        rejected: Object.fromEntries(rejected),
        candidates: top.map(({ image, file, original, notes }) => ({ image, file, original, notes })),
      },
      null,
      2,
    ),
  );
  if (!top.length) {
    console.error("쓸 수 있는 사진이 없음. 머리말에서 image 를 빼면 사이트가 글자 표지를 쓴다.");
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
