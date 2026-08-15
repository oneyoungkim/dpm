import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SportEvent } from "../../lib/types";
import { dateKey } from "../../lib/kst";

/**
 * data/manual.json 오버레이.
 * 국내 격투기 단체나 국제 종합대회처럼 공개 API가 없는 이벤트를 손으로 채운다.
 * 같은 id가 크롤 결과에도 있으면 이 쪽이 이긴다(crawl.ts의 병합 순서 참고).
 */

type ManualEvent = Partial<SportEvent> & Pick<SportEvent, "id" | "startsAt">;

export function loadManual(from: string, to: string): SportEvent[] {
  const path = join(process.cwd(), "data", "manual.json");

  let parsed: { events?: ManualEvent[] };
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch (err) {
    console.warn(`   ! manual.json 을 못 읽었다: ${err instanceof Error ? err.message : err}`);
    return [];
  }

  const out: SportEvent[] = [];
  for (const e of parsed.events ?? []) {
    const ts = Date.parse(e.startsAt);
    if (Number.isNaN(ts)) {
      console.warn(`   ! startsAt 형식 오류로 건너뜀: ${e.id}`);
      continue;
    }
    const key = dateKey(new Date(ts));
    if (key < from || key > to) continue;

    out.push({
      sport: "기타",
      league: "기타",
      leagueKey: "manual",
      title: e.id,
      status: "예정",
      source: "수동 입력",
      ...e,
      dateKey: key,
      hype: 0,
    } as SportEvent);
  }

  return out;
}
