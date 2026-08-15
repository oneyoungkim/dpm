import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { addDays, todayKey } from "../lib/kst";
import {
  candidatesFileSchema,
  hasWeakVerification,
  type CandidatesFile,
  type EventCandidate,
} from "./discovery/candidate-schema";
import { extractEventsFromFeeds } from "./discovery/extract-events";
import { fetchAllOfficialFeeds } from "./discovery/official-feeds";
import { discoverEventsFromWeb } from "./discovery/web-search";

const DEFAULT_FORWARD_DAYS = 550;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readCandidates(path: string): CandidatesFile {
  try {
    const checked = candidatesFileSchema.safeParse(JSON.parse(readFileSync(path, "utf-8")));
    if (checked.success) return checked.data;
    console.warn(`기존 candidates.json 형식 오류 — 빈 후보로 시작: ${checked.error.message}`);
  } catch (error) {
    console.warn(`기존 candidates.json 읽기 실패 — 빈 후보로 시작: ${error}`);
  }
  return { generatedAt: null, events: [] };
}

function sameEvents(a: EventCandidate[], b: EventCandidate[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const dry = process.argv.includes("--dry");
  const feedsOnly = process.argv.includes("--feeds-only");
  const forwardDays = Number(arg("days") ?? process.env.DISCOVERY_FORWARD_DAYS ?? DEFAULT_FORWARD_DAYS);
  const limitPerFeed = Number(process.env.DISCOVERY_FEED_LIMIT ?? 8);
  if (!Number.isFinite(forwardDays) || forwardDays < 1) throw new Error("--days 는 1 이상의 숫자여야 한다");
  if (!Number.isFinite(limitPerFeed) || limitPerFeed < 1 || limitPerFeed > 30) {
    throw new Error("DISCOVERY_FEED_LIMIT 는 1~30이어야 한다");
  }

  const out = join(process.cwd(), "data", "candidates.json");
  const previous = readCandidates(out);
  console.log(`\n[DPMBROS DISCOVERY] 공식 피드·웹 검색 → 이벤트 후보 (기존 ${previous.events.length}건)\n`);

  if (!feedsOnly && !process.env.OPENAI_API_KEY) {
    console.log("OPENAI_API_KEY 없음 — 기존 후보를 보존하고 AI 발견 단계를 건너뛴다.\n");
    return;
  }

  const items = await fetchAllOfficialFeeds(limitPerFeed);
  console.log(`\n공식 원문 총 ${items.length}건`);
  if (feedsOnly) {
    console.log("--feeds-only 라서 AI 호출과 파일 쓰기는 하지 않았다.\n");
    return;
  }
  const from = todayKey();
  const to = addDays(from, forwardDays);
  const feedEvents = items.length > 0 ? await extractEventsFromFeeds(items, from, to) : [];
  let webEvents: EventCandidate[] = [];
  try {
    webEvents = await discoverEventsFromWeb(from, to);
  } catch (error) {
    console.warn(`웹 검색 발견 실패 — 공식 RSS 결과로 계속: ${error instanceof Error ? error.message : error}`);
  }
  const discovered = [...feedEvents, ...webEvents].filter(
    (event) => !hasWeakVerification(event),
  );
  console.log(
    `AI 추출·코드 검증 통과 ${discovered.length}건 ` +
      `(RSS ${feedEvents.length} · 웹 ${webEvents.length}, ${from} ~ ${to})`,
  );

  const retained = previous.events.filter((event) => {
    const key = event.startsAt.slice(0, 10);
    return key >= addDays(from, -14) && key <= to && !hasWeakVerification(event);
  });
  const merged = new Map(retained.map((event) => [event.id, event]));
  for (const event of discovered) merged.set(event.id, event);
  const events = [...merged.values()].sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title),
  );

  if (dry) {
    console.log(`--dry 결과 후보 ${events.length}건 — 파일은 쓰지 않았다.\n`);
    return;
  }
  if (sameEvents(previous.events, events)) {
    console.log("후보 내용에 변화 없음 — candidates.json을 다시 쓰지 않았다.\n");
    return;
  }

  const next: CandidatesFile = { generatedAt: new Date().toISOString(), events };
  writeFileSync(out, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  console.log(`저장 완료 → ${out} (${events.length}건)\n`);
}

main().catch((error) => {
  console.error(`\n발견 단계 실패: ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
