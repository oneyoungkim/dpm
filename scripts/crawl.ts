import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EventsFile, SportEvent } from "../lib/types";
import { addDays, todayKey } from "../lib/kst";
import { scoreHype } from "../lib/hype";
import { interestCategoryOf } from "../lib/interests";
import { crawlNaverSports } from "./sources/naver-sports";
import { crawlNaverEsports } from "./sources/naver-esports";
import { crawlFighting } from "./sources/fighting";
import { crawlBlackCombat } from "./sources/blackcombat";
import { loadManual } from "./sources/manual";
import { loadCandidates } from "./sources/candidates";

/**
 * 모든 소스를 긁어 data/events.json 하나로 합친다.
 * 사이트는 이 파일만 읽는다 — 크롤이 실패해도 직전 스냅샷으로 계속 서비스된다.
 *
 *   npm run crawl          기본 창(어제 ~ +35일)
 *   npm run crawl -- --days 60
 *   npm run crawl:dry      파일을 쓰지 않고 요약만 출력
 */

/** 어제부터 담는다 — "어제 그 경기 어떻게 됐지"가 첫 화면에서 바로 보이게. */
const LOOKBACK_DAYS = 1;
const DEFAULT_FORWARD_DAYS = 35;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function combatFamily(event: SportEvent): string | null {
  if (event.category !== "격투기" && event.sport !== "격투기") return null;
  const text = `${event.leagueKey} ${event.league} ${event.series ?? ""} ${event.source}`.toLowerCase();
  if (/ufc/.test(text)) return "ufc";
  if (/black.?combat|블랙컴뱃/.test(text)) return "blackcombat";
  if (/road.?fc/.test(text)) return "roadfc";
  if (/\bone\b/.test(text)) return "one";
  if (/\bpfl\b/.test(text)) return "pfl";
  return null;
}

function normalizedTitle(event: SportEvent): string {
  const matchup = event.title.match(/([^:()]+\s+vs\.?\s+[^:()]+)/i)?.[1] ?? event.title;
  return matchup.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
}

function duplicatesExistingCandidate(candidate: SportEvent, existing: Iterable<SportEvent>): boolean {
  if (!candidate.id.startsWith("candidate:")) return false;
  const family = combatFamily(candidate);
  if (!family) return false;
  const title = normalizedTitle(candidate);
  for (const event of existing) {
    if (event.dateKey !== candidate.dateKey || combatFamily(event) !== family) continue;
    const other = normalizedTitle(event);
    if (title === other || title.includes(other) || other.includes(title)) return true;
  }
  return false;
}

async function main() {
  const dry = process.argv.includes("--dry");
  const forward = Number(arg("days") ?? DEFAULT_FORWARD_DAYS);
  if (!Number.isFinite(forward) || forward < 1) {
    console.error("--days 는 1 이상의 숫자여야 한다");
    process.exit(1);
  }

  const today = todayKey();
  const from = addDays(today, -LOOKBACK_DAYS);
  const to = addDays(today, forward);

  console.log(`\n[DPMBROS] 수집 구간 ${from} ~ ${to}\n`);

  const jobs: Array<{ name: string; run: () => Promise<SportEvent[]> }> = [
    { name: "네이버 스포츠", run: () => crawlNaverSports(from, to) },
    { name: "네이버 e스포츠", run: () => crawlNaverEsports(from, to) },
    { name: "격투기", run: () => crawlFighting(from, to) },
    { name: "블랙컴뱃", run: () => crawlBlackCombat(from, to) },
    { name: "외부 이벤트 후보", run: async () => loadCandidates(from, to) },
    { name: "수동 입력", run: async () => loadManual(from, to) },
  ];

  const stats: Record<string, number> = {};
  const collected: SportEvent[][] = [];

  for (const job of jobs) {
    process.stdout.write(` - ${job.name} ... `);
    try {
      const events = await job.run();
      stats[job.name] = events.length;
      collected.push(events);
      console.log(`${events.length}건`);
    } catch (err) {
      // 소스 하나가 터져도 나머지는 계속 간다
      stats[job.name] = 0;
      collected.push([]);
      console.log(`실패 (${err instanceof Error ? err.message : err})`);
    }
  }

  // 병합 — 뒤에 오는 소스가 이긴다. jobs 순서상 수동 입력이 마지막이라 최우선.
  const byId = new Map<string, SportEvent>();
  for (const batch of collected) {
    for (const e of batch) {
      if (duplicatesExistingCandidate(e, byId.values())) continue;
      byId.set(e.id, e);
    }
  }

  const verifiedAt = new Date().toISOString();
  const events = [...byId.values()].map((e) => {
    const { hype, reason } = scoreHype(e);
    return {
      ...e,
      category: interestCategoryOf(e),
      tags:
        e.tags ??
        [e.sport, e.league, e.home?.name, e.away?.name].filter(
          (tag): tag is string => Boolean(tag),
        ),
      eventMode: e.eventMode ?? "scheduled",
      datePrecision: e.datePrecision ?? (e.timeTbd ? "date" : "time"),
      confidence: e.confidence ?? "confirmed",
      lastVerifiedAt: verifiedAt,
      hype,
      hypeReason: reason ?? e.hypeReason,
    };
  });

  // 날짜 → 하이프 → 시작시각 순. 사이트가 이 순서를 그대로 믿고 쓴다.
  events.sort(
    (a, b) =>
      a.dateKey.localeCompare(b.dateKey) ||
      b.hype - a.hype ||
      a.startsAt.localeCompare(b.startsAt),
  );

  const file: EventsFile = {
    generatedAt: new Date().toISOString(),
    range: { from, to },
    events,
    stats,
  };

  const total = events.length;
  const must = events.filter((e) => e.hype >= 70).length;
  console.log(`\n총 ${total}건 (필수시청 ${must}건)`);

  const bySport = new Map<string, number>();
  for (const e of events) bySport.set(e.sport, (bySport.get(e.sport) ?? 0) + 1);
  console.log(
    [...bySport.entries()].map(([s, n]) => `${s} ${n}`).join(" · ") || "(없음)",
  );

  console.log("\n하이프 상위 10");
  for (const e of [...events].sort((a, b) => b.hype - a.hype).slice(0, 10)) {
    const why = e.hypeReason ? ` — ${e.hypeReason}` : "";
    console.log(`  ${String(e.hype).padStart(3)} [${e.dateKey}] ${e.league} ${e.title}${why}`);
  }

  if (dry) {
    console.log("\n--dry 라서 파일은 쓰지 않았다.\n");
    return;
  }

  // 한 건도 못 긁었으면 기존 스냅샷을 덮어쓰지 않는다.
  // 전부 실패한 날 빈 사이트를 배포하는 게 제일 나쁜 결과다.
  if (total === 0) {
    console.error("\n수집 결과가 0건이라 events.json 을 덮어쓰지 않는다.\n");
    process.exit(1);
  }

  // 들여쓰기 없이 쓴다. CI가 하루 4번 커밋하는 산출물이라 40%를 아끼는 게
  // 손으로 읽기 편한 것보다 낫다 (읽어야 하면 `npm run crawl:dry` 요약을 보면 된다).
  const out = join(process.cwd(), "data", "events.json");
  const json = JSON.stringify(file);
  writeFileSync(out, json, "utf-8");
  console.log(`\n저장 완료 → ${out} (${Math.round(Buffer.byteLength(json) / 1024)}KB)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
