/**
 * 지난 집계 기록(data/trends-history.json). 최근 48회만 둔다.
 * delta·streak·spark 는 여기 기록과 이번 순위를 비교해 채운다.
 */

import { existsSync, readFileSync } from "node:fs";

export const HISTORY_LIMIT = 48;
const SPARK_LENGTH = 12;

export interface HistoryRun {
  generatedAt: string;
  /** rank 순서. 민감 키워드도 포함(전체 순위 기준). sensitive 는 11-26부터 기록한다. */
  keywords: Array<{ keyword: string; rank: number; score: number; sensitive?: boolean }>;
}

export interface HistoryFile {
  runs: HistoryRun[];
}

export function loadHistory(path: string): HistoryFile {
  if (!existsSync(path)) return { runs: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as HistoryFile;
    return Array.isArray(parsed.runs) ? parsed : { runs: [] };
  } catch {
    console.warn("   ! trends-history.json 을 읽지 못해 빈 기록으로 시작합니다");
    return { runs: [] };
  }
}

export interface Trend {
  delta: number | null;
  streak: number;
  spark: number[];
}

/**
 * history 는 이번 집계를 넣기 전 상태(옛것 → 최신).
 * mainRank 는 민감 키워드를 뺀 기본 차트에서의 순위(민감 키워드면 null).
 * 화면의 기본 차트는 민감 키워드를 빼고 번호를 다시 매기므로, 변화도 그 번호끼리 비교해야 숫자가 맞는다.
 */
export function trendOf(
  keyword: string,
  rank: number,
  score: number,
  history: HistoryFile,
  mainRank: number | null = null,
): Trend {
  const runs = history.runs;
  const previous = runs.at(-1);
  const prevHit = previous?.keywords.find((k) => k.keyword === keyword);
  let delta = prevHit ? prevHit.rank - rank : null;
  if (previous && prevHit && mainRank !== null && previous.keywords.every((k) => k.sensitive !== undefined)) {
    if (!prevHit.sensitive) {
      const prevMain = previous.keywords.filter((k) => !k.sensitive).findIndex((k) => k.keyword === keyword) + 1;
      delta = prevMain - mainRank;
    }
  }

  let streak = 1;
  for (let i = runs.length - 1; i >= 0; i--) {
    if (!runs[i].keywords.some((k) => k.keyword === keyword)) break;
    streak++;
  }

  // 최근 11회 + 이번. 순위권 밖이던 회차는 0, 처음 나오기 전 회차는 뺀다.
  const recent = runs.slice(-(SPARK_LENGTH - 1));
  const series = recent.map((run) => run.keywords.find((k) => k.keyword === keyword)?.score ?? null);
  const first = series.findIndex((v) => v !== null);
  const spark = first === -1 ? [] : series.slice(first).map((v) => v ?? 0);
  spark.push(score);
  return { delta, streak, spark };
}

export function appendRun(history: HistoryFile, run: HistoryRun): HistoryFile {
  return { runs: [...history.runs, run].slice(-HISTORY_LIMIT) };
}
