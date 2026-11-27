import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 남자 커뮤니티 키워드 순위.
 * scripts/trends/run.ts 가 data/trends.json 을 만들고, 사이트는 이 파일로만 읽는다.
 * 숫자(언급 수·점수)는 전부 코드가 센 값이다. AI는 글 제목에 키워드를 붙이는 일만 한다.
 */

/** 화면 탭 순서이기도 하다. */
export const TREND_CATEGORIES = [
  "축구",
  "야구",
  "격투기",
  "농구",
  "게임",
  "테크",
  "자동차",
  "돈",
  "연예",
  "시사",
  "기타",
] as const;

export type TrendCategory = (typeof TREND_CATEGORIES)[number];

export interface TrendSample {
  /** 원글 제목. 욕설·성인·혐오 표현이 걸린 제목은 샘플로 쓰지 않는다. */
  title: string;
  url: string;
  /** TrendSource.id */
  source: string;
}

export interface TrendKeyword {
  /** 1부터. 전체 순위다. */
  rank: number;
  /** 화면에 쓰는 이름. 같은 대상은 한 이름으로 합친다(쏘니 → 손흥민). */
  keyword: string;
  category: TrendCategory;
  /** 0~100. 1위가 100. */
  score: number;
  /** 이 키워드가 걸린 글 수 */
  mentions: number;
  /** 이 키워드가 나온 커뮤니티 id 목록 */
  sources: string[];
  /** 직전 집계보다 몇 계단 올랐나(+면 상승). 직전 집계에 없었으면 null(NEW). */
  delta: number | null;
  /** 연속으로 순위권에 든 집계 횟수 */
  streak: number;
  /** 정치·사건사고·성인·혐오. 기본 차트에서 빼고, 샘플 글도 싣지 않는다. */
  sensitive: boolean;
  /** 대표 글 최대 3개. sensitive면 빈 배열. */
  samples: TrendSample[];
  /** 최근 집계들의 점수(옛것 → 최신, 최대 12개). 추이 선 그리기용. */
  spark: number[];
  /**
   * 에펨코리아 검색어 순위에 올라 점수를 더 받았으면 그 검색어(여럿이 한 키워드로 모이면 가장 높은 것).
   * 없으면 필드가 없다.
   */
  fmSearch?: FmSearchItem;
}

/** 에펨코리아 검색어 순위 한 줄(위젯에 보이는 그대로) */
export interface FmSearchItem {
  /** 1부터 */
  rank: number;
  /** 검색어(위젯 표기 그대로) */
  keyword: string;
  /** 직전 대비 순위 변화. +면 상승, 0 은 변화 표시 없음, "new" 는 새로 오름 */
  change: number | "new";
}

export interface FmSearchEntry extends FmSearchItem {
  /** 정치·사건사고·욕설 등. 화면에 싣지 않는다. */
  sensitive: boolean;
  /** 이 검색어를 반영한 키워드 순위의 이름. 걸러졌거나 순위에 못 들었으면 null */
  matched: string | null;
}

/**
 * 에펨코리아 검색어 순위(포텐 터짐 /best 첫 쪽에 함께 실리는 위젯).
 * 에펨코리아 설명: 최근 24시간 집계, 로그인 사용자 검색만 반영.
 */
export interface FmSearchRanking {
  /** 그 쪽을 받은 시각 ISO(보조 수집이면 한국 컴퓨터가 받은 시각) */
  collectedAt: string;
  /** 읽은 쪽 주소 */
  url: string;
  /** rank 오름차순 */
  items: FmSearchEntry[];
}

export interface TrendSource {
  /** "fmkorea" 같은 영문 소문자 id */
  id: string;
  /** "에펨코리아" */
  name: string;
  /** 긁은 목록 페이지 주소 */
  url: string;
  /** 이번 집계에 쓴 글 수 */
  posts: number;
  /** 이번 집계에서 수집에 성공했나 */
  ok: boolean;
}

export interface TrendsFile {
  /** 집계 시각 ISO */
  generatedAt: string;
  sources: TrendSource[];
  /** rank 오름차순, 최대 50개 */
  keywords: TrendKeyword[];
  /** 이번 집계에 반영한 에펨코리아 검색어 순위. 못 읽었거나 오래됐으면 null(11-27 전 파일에는 필드가 없다) */
  fmkoreaSearch?: FmSearchRanking | null;
}

const EMPTY: TrendsFile = { generatedAt: new Date(0).toISOString(), sources: [], keywords: [] };

export function loadTrends(): TrendsFile {
  try {
    const raw = readFileSync(join(process.cwd(), "data", "trends.json"), "utf-8");
    const parsed = JSON.parse(raw) as TrendsFile;
    if (!Array.isArray(parsed.keywords)) return EMPTY;
    return parsed;
  } catch {
    // 한 번도 집계하지 않았어도 사이트는 떠야 한다
    return EMPTY;
  }
}

/** 기본 차트: 민감 키워드를 뺀 순위. 빠진 자리는 다시 1부터 매긴다. */
export function mainChart(file: TrendsFile, limit = 20): TrendKeyword[] {
  return file.keywords
    .filter((item) => !item.sensitive)
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

export function chartByCategory(file: TrendsFile, category: TrendCategory, limit = 20): TrendKeyword[] {
  return file.keywords
    .filter((item) => item.category === category)
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

/** 실제로 키워드가 있는 분류만, TREND_CATEGORIES 순서대로. */
export function activeTrendCategories(file: TrendsFile): TrendCategory[] {
  const present = new Set(file.keywords.map((item) => item.category));
  return TREND_CATEGORIES.filter((category) => present.has(category));
}
