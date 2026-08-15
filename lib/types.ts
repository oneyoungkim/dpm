/** 사이트 전체가 다루는 단 하나의 이벤트 형태. 모든 크롤러는 여기로 정규화된다. */

/** 상단 필터 칩에 노출되는 대분류. 순서가 곧 칩 노출 순서다. */
export const SPORTS = [
  "야구",
  "축구",
  "e스포츠",
  "격투기",
  "농구",
  "배구",
  "기타",
] as const;

export type Sport = (typeof SPORTS)[number];

/** 사용자가 고르는 관심사. 종목보다 넓어서 제품·출시·특별 이벤트도 함께 담는다. */
export const INTEREST_CATEGORIES = [
  "축구",
  "야구",
  "격투기",
  "e스포츠",
  "농구",
  "모터스포츠",
  "기타 스포츠",
  "빅 스포츠",
  "게임",
  "테크",
  "돈과 승부",
  "특별 이벤트",
] as const;

export type InterestCategory = (typeof INTEREST_CATEGORIES)[number];
export type EventMode = "scheduled" | "release-window" | "live-trigger";
export type EventConfidence = "confirmed" | "expected" | "rumored";
export type DatePrecision = "time" | "date" | "month";

export type EventStatus = "예정" | "진행중" | "종료" | "취소";

export interface Team {
  name: string;
  /** 엠블럼 URL. 없으면 UI가 이니셜 뱃지로 대체한다. */
  logo?: string;
  score?: number;
}

export interface SportEvent {
  /** 소스 접두사 + 원본 ID. 크롤러를 다시 돌려도 같은 경기는 같은 id여야 중복이 안 생긴다. */
  id: string;
  sport: Sport;
  /** 사용자 관심사 필터용 범용 분류. 기존 데이터는 sport에서 자동 변환한다. */
  category?: InterestCategory;
  /** 팀·브랜드·제품·대회 등 개인화에 쓰는 검색 가능한 태그 */
  tags?: string[];
  /** 월드컵, Apple Event처럼 여러 이벤트를 묶는 상위 시리즈 */
  series?: string;
  eventMode?: EventMode;
  datePrecision?: DatePrecision;
  confidence?: EventConfidence;
  /** "KBO리그", "프리미어리그", "LCK" 같은 리그 표시명 */
  league: string;
  /** 리그 식별 슬러그. 하이프 가중치 테이블의 키로 쓰인다. */
  leagueKey: string;
  /** 카드 제목. 팀 경기면 "삼성 vs 한화", 단일 이벤트면 "UFC 331" */
  title: string;
  /** ISO 8601 (KST 오프셋 포함) */
  startsAt: string;
  /** 날짜만 확정이고 시각은 미정일 때. UI가 "시간 미정"으로 표시한다. */
  timeTbd?: boolean;
  /** YYYY-MM-DD (KST 기준). 캘린더 그룹핑 키 */
  dateKey: string;
  status: EventStatus;
  /** "3회초", "경기종료" 등 소스가 주는 부가 상태 문구 */
  statusNote?: string;
  home?: Team;
  away?: Team;
  venue?: string;
  /** "정규시즌 3R", "리그 페이즈 1차전" 등 라운드 정보 */
  round?: string;
  /** 중계/상세 링크 */
  link?: string;
  /** 0~100. 클수록 "오늘 이건 봐야 함". lib/hype.ts 참고 */
  hype: number;
  /** 하이프 점수가 왜 높은지 사람이 읽는 한 줄 이유 */
  hypeReason?: string;
  /** 데이터 출처 (푸터 고지 및 디버깅용) */
  source: string;
  sourceUrl?: string;
  lastVerifiedAt?: string;
  /** 자동 수집 연결 전 제품 UX를 확인하기 위한 명시적 미리보기 데이터 */
  preview?: boolean;
}

export interface EventsFile {
  /** 크롤 시각 ISO */
  generatedAt: string;
  /** 수집 구간 */
  range: { from: string; to: string };
  events: SportEvent[];
  /** 소스별 수집 건수 — 크롤이 조용히 실패했는지 한눈에 본다 */
  stats: Record<string, number>;
}
