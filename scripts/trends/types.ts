import type { FmSearchItem } from "../../lib/trends";

/**
 * 커뮤니티 키워드 순위 수집에서 쓰는 내부 타입.
 * 사이트에 나가는 형식은 lib/trends.ts 의 TrendsFile 이고, 여기 것은 집계 도중에만 쓴다.
 */

/** 목록 페이지 한 줄. 본문은 받지 않는다. */
export interface RawPost {
  /** TrendSource.id */
  source: string;
  title: string;
  url: string;
  /** 게시판 이름(목록에 보이는 그대로). 없으면 빈 문자열 */
  board: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  /** 목록에서 정치 글로 표시된 글(에펨 politics 표시 등) */
  politicsFlag?: boolean;
  /** 핫딜·광고처럼 이야깃거리가 아닌 줄. 키워드 집계에서 뺀다 */
  skip?: boolean;
  /** 성인 게시판 글. 샘플로 쓰지 않는다 */
  adultBoard?: boolean;
}

export interface SourceAdapter {
  id: string;
  name: string;
  /** 사이트에 보여 줄 대표 목록 주소 */
  listUrl: string;
  /** 읽을 목록 페이지들(최대 2개) */
  pages: string[];
  /** 받은 HTML 한 쪽에서 글 줄을 뽑는다 */
  parse(html: string, pageUrl: string): RawPost[];
  /** 기본 Accept 말고 따로 필요한 요청 헤더 */
  headers?: Record<string, string>;
  /**
   * 첫 쪽 HTML 에 함께 실린 검색어 순위를 뽑는다(에펨코리아만). 새 주소를 요청하지 않는다.
   * 못 찾으면 빈 배열(글 목록 수집은 그대로 성공).
   */
  parseSearchRanking?(html: string): FmSearchItem[];
}

/** 소스 첫 쪽에서 함께 읽은 검색어 순위 */
export interface SearchRanking {
  /** 그 쪽을 받은 시각 ISO */
  collectedAt: string;
  items: FmSearchItem[];
}

export interface SourceResult {
  adapter: SourceAdapter;
  posts: RawPost[];
  ok: boolean;
  error?: string;
  /** 직접 읽지 못해 보조 수집본으로 메웠을 때의 설명 */
  note?: string;
  /** parseSearchRanking 이 있는 소스만 */
  searchRanking?: SearchRanking;
}
