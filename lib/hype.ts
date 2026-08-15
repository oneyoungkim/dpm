import type { SportEvent } from "./types";
import { kstHour } from "./kst";

/**
 * "오늘 뭐 봄?"에 답하기 위한 점수. 하루에 경기가 200개씩 쏟아지는데
 * 그걸 그냥 시간순으로 나열하면 아무도 안 본다. 그래서 점수를 매겨 위로 올린다.
 *
 * 점수는 = 리그 기본값 + 라운드(결승/PO) + 팀 화제성 + 라이벌전 + 편성 시간
 * 최종적으로 0~100으로 자른다. 값 자체보다 "같은 날 안에서의 상대 순위"가 중요하다.
 *
 * 이 파일의 테이블들은 취향이다. 계속 손보라고 데이터로 분리해뒀다.
 */

/** 리그 기본 점수 (0~70). leagueKey 기준. */
const LEAGUE_BASE: Record<string, number> = {
  // 축구
  worldcup: 78,
  ucl: 60,
  uel: 38,
  epl: 50,
  laliga: 40,
  seriea: 36,
  bundesliga: 36,
  ligue1: 30,
  kleague1: 38,
  kleague2: 18,
  acl: 32,
  korea_nt: 76,
  mls: 14,
  j1: 12,
  clubfriendly: 10,

  // 야구
  kbo: 45,
  kbo_postseason: 72,
  mlb: 30,
  npb: 12,

  // e스포츠
  worlds: 74,
  lck: 55,
  msi: 66,
  // 2군 리그. 팀 이름이 1군과 겹쳐서(“T1 e스포츠 아카데미”) 화제성 점수를 그대로 먹으므로
  // 기본값을 낮게 눌러둬야 1군 경기를 밀어내지 않는다.
  lck_cl: 8,
  valorant: 30,
  overwatch: 26,
  starcraft: 22,

  // 격투기
  ufc_numbered: 72,
  ufc_fight_night: 40,
  boxing: 34,
  blackcombat: 42,
  roadfc: 32,
  one: 48,
  pfl: 44,

  // 기타
  asiangames: 58,
  nba: 34,
  kbl: 16,
  vleague: 16,
};

/** 리그를 못 알아봤을 때의 기본값. 완전히 묻히지는 않게 한다. */
const DEFAULT_BASE = 20;

/** 스포츠 밖의 이벤트는 종목 리그가 없으므로 관심사별 기본값에서 시작한다. */
const CATEGORY_BASE: Partial<Record<NonNullable<SportEvent["category"]>, number>> = {
  "빅 스포츠": 68,
  게임: 55,
  테크: 55,
  모터스포츠: 48,
  "돈과 승부": 42,
  "특별 이벤트": 50,
};

const EVENT_TAG_BONUS: Array<[RegExp, number, string?]> = [
  [/올림픽|월드컵|WBC|슈퍼볼/i, 18, "세계가 기다리는 무대"],
  [/Apple|iPhone|Nintendo|PlayStation/i, 17],
  [/Samsung|Galaxy|Xbox/i, 13],
  [/WrestleMania|WSOP/i, 14],
  [/신작|글로벌 출시|쇼케이스|신제품 발표/i, 12],
  [/우주|발사|달 탐사/i, 12],
  [/경매|파이널|추첨/i, 8],
];

/** 라운드/대회 단계 키워드 → 가산점. 위에서부터 먼저 맞는 것 하나만 적용. */
const ROUND_BONUS: Array<[RegExp, number, string]> = [
  [/결승|파이널|final|우승/i, 22, "결승전"],
  [/준결승|4강|semi/i, 15, "4강"],
  [/8강|quarter/i, 11, "8강"],
  [/플레이오프|playoff|po|와일드카드/i, 14, "플레이오프"],
  [/한국시리즈|코리안시리즈/i, 25, "한국시리즈"],
  [/더비|derby|클라시코|clasico/i, 16, "더비"],
  [/개막|opening/i, 8, "개막전"],
];

/**
 * 팀 화제성 (0~14). 국내에서 이 팀 이름만 떠도 사람이 모이는 정도.
 * 부분 문자열 매칭이라 "맨체스터 시티" 안의 "맨체스터"에 걸리지 않도록
 * 긴 이름을 먼저 검사한다(아래 teamHeat에서 길이순 정렬).
 */
const TEAM_HEAT: Record<string, number> = {
  // EPL / 유럽
  토트넘: 14,
  맨유: 13,
  "맨체스터 유나이티드": 13,
  리버풀: 12,
  아스날: 11,
  아스널: 11,
  첼시: 10,
  "맨체스터 시티": 12,
  맨시티: 12,
  레알: 13,
  "레알 마드리드": 13,
  바르셀로나: 13,
  바이에른: 11,
  뮌헨: 11,
  PSG: 11,
  "파리 생제르맹": 11,
  울버햄튼: 9,
  뉴캐슬: 8,
  AT마드리드: 8,
  "AT 마드리드": 8,

  // K리그
  전북: 8,
  울산: 8,
  "FC서울": 9,
  서울: 9,
  수원: 7,
  포항: 6,

  // KBO — 팬덤 규모 체감순
  롯데: 12,
  KIA: 11,
  기아: 11,
  삼성: 10,
  LG: 10,
  두산: 10,
  한화: 11,
  SSG: 8,
  KT: 6,
  NC: 6,
  키움: 5,

  // LCK
  T1: 14,
  젠지: 12,
  한화생명: 10,
  KT롤스터: 8,
  디플러스: 7,
  광동: 6,
  농심: 5,
  DRX: 5,

  // MLB — 국내 중계 화제성
  다저스: 10,
  "LA 다저스": 10,
  양키스: 8,
  샌디에이고: 8,
};

/** 붙기만 하면 판이 커지는 조합. [A, B, 보너스, 라벨] */
const RIVALRIES: Array<[string, string, number, string]> = [
  ["T1", "젠지", 18, "T1 vs 젠지"],
  ["레알", "바르셀로나", 20, "엘 클라시코"],
  ["맨유", "리버풀", 18, "노스웨스트 더비"],
  ["맨체스터 유나이티드", "리버풀", 18, "노스웨스트 더비"],
  ["토트넘", "아스날", 16, "북런던 더비"],
  ["토트넘", "아스널", 16, "북런던 더비"],
  ["롯데", "삼성", 12, "낙동강 더비"],
  ["KIA", "삼성", 12, "전통의 라이벌"],
  ["기아", "삼성", 12, "전통의 라이벌"],
  ["LG", "두산", 12, "잠실 라이벌"],
  ["전북", "울산", 12, "현대가 더비"],
  ["FC서울", "수원", 12, "슈퍼매치"],
];

function heatOf(name?: string): { score: number; hit?: string } {
  if (!name) return { score: 0 };
  const keys = Object.keys(TEAM_HEAT).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (name.includes(k)) return { score: TEAM_HEAT[k], hit: k };
  }
  return { score: 0 };
}

function rivalryOf(home?: string, away?: string) {
  if (!home || !away) return null;
  for (const [a, b, bonus, label] of RIVALRIES) {
    const ha = home.includes(a) && away.includes(b);
    const hb = home.includes(b) && away.includes(a);
    if (ha || hb) return { bonus, label };
  }
  return null;
}

type Scorable = Pick<
  SportEvent,
  "leagueKey" | "league" | "round" | "title" | "startsAt" | "category" | "tags" | "series"
> & {
  home?: { name: string };
  away?: { name: string };
};

/** 점수와 "왜 높은지" 한 줄을 같이 낸다. UI가 배지로 그대로 쓴다. */
export function scoreHype(e: Scorable): { hype: number; reason?: string } {
  const reasons: string[] = [];

  let score = LEAGUE_BASE[e.leagueKey] ?? (e.category ? CATEGORY_BASE[e.category] : undefined) ?? DEFAULT_BASE;

  const tagText = `${e.series ?? ""} ${e.title} ${(e.tags ?? []).join(" ")}`;
  for (const [pattern, bonus, label] of EVENT_TAG_BONUS) {
    if (pattern.test(tagText)) {
      score += bonus;
      if (label) reasons.push(label);
      break;
    }
  }

  // 라운드 보너스 — 제목과 라운드 문구를 함께 본다
  const roundText = `${e.round ?? ""} ${e.title}`;
  for (const [re, bonus, label] of ROUND_BONUS) {
    if (re.test(roundText)) {
      score += bonus;
      reasons.push(label);
      break;
    }
  }

  // 팀 화제성 — 양 팀 중 높은 쪽을 온전히, 낮은 쪽은 절반만 반영.
  // 빅클럽 하나만 나와도 보긴 보되, 양쪽 다 빅클럽인 경기를 더 위로 올린다.
  const h = heatOf(e.home?.name);
  const a = heatOf(e.away?.name);
  const hi = Math.max(h.score, a.score);
  const lo = Math.min(h.score, a.score);
  score += hi + lo * 0.5;

  const rivalry = rivalryOf(e.home?.name, e.away?.name);
  if (rivalry) {
    score += rivalry.bonus;
    reasons.unshift(rivalry.label);
  }

  // 편성 시간 — 퇴근하고 소파에서 볼 수 있는 시간대에 가산점.
  // 새벽 유럽축구는 원래 새벽에 하는 게 정상이라 감점하지 않는다.
  const hour = kstHour(e.startsAt);
  if (hour >= 18 && hour <= 23) score += 6;
  else if (hour >= 12 && hour < 18) score += 2;

  const hype = Math.max(0, Math.min(100, Math.round(score)));

  // 이유는 라운드/라이벌전처럼 "설명이 되는 것"만 노출한다.
  // 리그 가중치가 높아서 점수가 높은 건 굳이 말할 필요가 없다.
  return { hype, reason: reasons.length ? reasons.join(" · ") : undefined };
}

/** 하이프 등급 — UI 배지 색을 여기서 한 곳으로 모은다. */
export function hypeTier(hype: number): "must" | "hot" | "normal" {
  if (hype >= 70) return "must";
  if (hype >= 50) return "hot";
  return "normal";
}
