import { createHash } from "node:crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { INTEREST_CATEGORIES } from "../../lib/types";
import { dateKey } from "../../lib/kst";
import { eventCandidateSchema, hasWeakVerification, type EventCandidate } from "./candidate-schema";

const OFFICIAL_SOURCES: Record<string, string> = {
  "ufc.com": "UFC",
  "blackcombat-official.com": "BLACK COMBAT",
  "roadfc.com": "ROAD FC",
  "onefc.com": "ONE Championship",
  "pflmma.com": "PFL",
  "wwe.com": "WWE",
  "olympics.com": "Olympics",
  "fifa.com": "FIFA",
  "mlb.com": "MLB",
  "nfl.com": "NFL",
  "formula1.com": "Formula 1",
  "motogp.com": "MotoGP",
  "playstation.com": "PlayStation",
  "xbox.com": "Xbox",
  "nintendo.com": "Nintendo",
  "apple.com": "Apple",
  "samsung.com": "Samsung",
  "rockstargames.com": "Rockstar Games",
  "wsop.com": "WSOP",
};

const SEARCH_DOMAINS = ["fmkorea.com", ...Object.keys(OFFICIAL_SOURCES)];

const searchedEventSchema = z.object({
  sourceUrl: z.string(),
  title: z.string(),
  category: z.enum(INTEREST_CATEGORIES),
  tags: z.array(z.string()),
  series: z.string(),
  startsAt: z.string(),
  timeTbd: z.boolean(),
  eventMode: z.enum(["scheduled", "release-window", "live-trigger"]),
  datePrecision: z.enum(["time", "date"]),
  confidence: z.enum(["confirmed", "expected", "rumored"]),
  reason: z.string(),
  round: z.string().nullable(),
});

const searchResultSchema = z.object({ events: z.array(searchedEventSchema) });

function hostnameOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function officialSource(value: string): string | null {
  const hostname = hostnameOf(value);
  if (!hostname) return null;
  for (const [host, name] of Object.entries(OFFICIAL_SOURCES)) {
    if (hostname === host || hostname.endsWith(`.${host}`)) return name;
  }
  return null;
}

function canonicalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

function consultedUrls(output: unknown): Set<string> {
  const urls = new Set<string>();
  if (!Array.isArray(output)) return urls;

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === "url" && typeof child === "string") {
        const canonical = canonicalUrl(child);
        if (canonical) urls.add(canonical);
      } else {
        visit(child);
      }
    }
  };

  for (const item of output) {
    if (item && typeof item === "object" && (item as { type?: string }).type === "web_search_call") {
      visit(item);
    }
  }
  return urls;
}

function stableId(sourceUrl: string, startsAt: string, series: string): string {
  return createHash("sha256")
    .update(`web|${sourceUrl}|${startsAt}|${series.toLowerCase()}`)
    .digest("hex")
    .slice(0, 20);
}

function normalize(
  raw: z.infer<typeof searchedEventSchema>,
  sources: Set<string>,
  from: string,
  to: string,
): EventCandidate | null {
  const sourceUrl = canonicalUrl(raw.sourceUrl);
  const source = sourceUrl ? officialSource(sourceUrl) : null;
  if (!sourceUrl || !source || !sources.has(sourceUrl)) return null;
  if (raw.confidence === "rumored" || Number.isNaN(Date.parse(raw.startsAt))) return null;
  if (hasWeakVerification({ ...raw, sourceUrl })) return null;
  const key = dateKey(new Date(raw.startsAt));
  if (key < from || key > to) return null;

  const candidate = {
    id: stableId(sourceUrl, raw.startsAt, raw.series),
    title: raw.title.trim(),
    category: raw.category,
    tags: [...new Set(raw.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 12),
    series: raw.series.trim(),
    startsAt: raw.startsAt,
    timeTbd: raw.timeTbd,
    eventMode: raw.eventMode,
    datePrecision: raw.datePrecision,
    confidence: raw.confidence,
    source,
    sourceUrl,
    reason: raw.reason.trim(),
    round: raw.round?.trim() || undefined,
  };
  const checked = eventCandidateSchema.safeParse(candidate);
  return checked.success ? checked.data : null;
}

export async function discoverEventsFromWeb(from: string, to: string): Promise<EventCandidate[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || process.env.DISCOVERY_WEB_SEARCH === "0") return [];

  const client = new OpenAI({ apiKey, timeout: 90_000, maxRetries: 2 });
  const model = process.env.OPENAI_EVENT_MODEL ?? "gpt-5.4-nano-2026-03-17";
  const response = await client.responses.parse({
    model,
    tools: [
      {
        type: "web_search",
        search_context_size: "medium",
        filters: { allowed_domains: SEARCH_DOMAINS },
      },
    ],
    include: ["web_search_call.action.sources"],
    input: [
      {
        role: "system",
        content:
          "너는 DPMBROS의 일정 탐색 편집자다. 웹과 커뮤니티 글은 후보를 찾는 단서일 뿐이며, 출력은 반드시 주최사·리그·제조사 공식 웹사이트에서 날짜를 재확인한 이벤트만 허용한다. 커뮤니티 URL, 뉴스 기사, 검색 결과 URL은 sourceUrl로 쓰지 않는다. 여러 해가 섞인 /events 같은 목록 페이지가 아니라 연도와 날짜가 명시된 개별 행사·공지 페이지를 sourceUrl로 쓴다. 한 출력은 정확히 한 이벤트만 나타내며, 서로 다른 날짜나 행사를 제목 하나로 합치지 않는다. 공식 페이지에 연도와 날짜가 명시되지 않으면 제외하고 추측하지 않는다. 소문은 rumored로 표시한다. 시간 미정이면 해당 날짜 12:00:00+09:00로 적고 timeTbd=true, datePrecision=date로 둔다. 제목은 모바일 카드에 맞게 80자 이내 한국어로 간결하게 쓴다.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "한국 이용자가 기다릴 만한 향후 이벤트를 검색하고 공식 출처로 검증",
          allowedDateRangeKst: { from, to },
          priorities: [
            "UFC·블랙컴뱃·ROAD FC·ONE·PFL 같은 격투기",
            "올림픽·월드컵·WBC·슈퍼볼·WrestleMania 같은 빅 이벤트",
            "F1·MotoGP·WSOP 같은 승부 이벤트",
            "게임 출시·콘솔 발표·Apple 또는 Samsung 공식 발표",
          ],
          communityLead: "에펨코리아는 빠진 후보를 찾는 단서로만 보고 반드시 공식 페이지에서 재검증",
          allowedCategories: INTEREST_CATEGORIES,
          required: "공식 페이지에 미래 날짜가 명시된 공개 이벤트만 출력",
        }),
      },
    ],
    text: { format: zodTextFormat(searchResultSchema, "dpmbros_web_events") },
    max_output_tokens: 5_000,
  });

  if (!response.output_parsed) return [];
  const sources = consultedUrls(response.output);
  return response.output_parsed.events.flatMap((raw) => {
    const event = normalize(raw, sources, from, to);
    return event ? [event] : [];
  });
}
