import type { SportEvent } from "./types";

/**
 * 한국에서 그 경기를 어디서 보는지. 일정 카드의 "중계" 줄이 여기서 나온다.
 *
 * 원칙: 틀린 중계 정보는 안 쓰는 것보다 나쁘다.
 * - 중계사·리그 공식 발표, 그다음 통신사·일간지 보도로 확인한 것만 적는다.
 *   위키·블로그·커뮤니티·AI 요약은 근거로 쓰지 않는다.
 * - sources 에는 실제로 읽은 주소만 넣는다.
 * - 확인 못 한 리그는 아예 적지 않는다. 그 리그 카드에는 중계 줄이 안 뜬다.
 * - 경기마다 채널이 다른 리그는 리그 단위 "주 중계"만 적고 note 로 알린다.
 * - until 이 지난 경기에는 표기하지 않는다. 다음 시즌 계약은 다시 확인해서 고친다.
 *
 * 2026-11-27 확인 때 비워 둔 리그와 이유:
 * - seriea: 2026-27 국내 중계사를 공식 발표·보도로 확인하지 못함
 *   (아시아 판매 대행 계약이 2026-27까지라는 것만 확인)
 * - one, pfl, roadfc: 다가오는 대회의 한국 중계처를 공식 안내에서 찾지 못함
 * - 게임·테크 일정: 출시·업데이트라 생중계가 아니고, 일정 링크에 공식 생중계 안내가 없음
 */

export type BroadcastKind = "OTT" | "TV" | "스트리밍" | "공식";

export interface BroadcastOutlet {
  name: string;
  kind: BroadcastKind;
  url?: string;
  /** 유료 구독·멤버십이 있어야 볼 수 있으면 true. 확인 못 했으면 비워 둔다. */
  paid?: boolean;
}

export interface LeagueBroadcast {
  outlets: BroadcastOutlet[];
  /** 카드에 작게 붙는 한 줄. 경기마다 다를 때 알리는 용도 */
  note?: string;
  checkedAt: "2026-11-27";
  sources: string[];
  /** 이 날짜(YYYY-MM-DD, 한국 시간) 뒤 경기에는 표기하지 않는다. 확인한 계약·시즌 끝 */
  until?: string;
}

const COUPANG_PLAY: BroadcastOutlet = {
  name: "쿠팡플레이",
  kind: "OTT",
  url: "https://www.coupangplay.com",
  paid: true,
};

/** 쿠팡플레이가 중계하는 축구·농구 목록을 한 번에 적은 2026-08 보도 */
const MTN_COUPANG_LINEUP = "https://news.mtn.co.kr/news-detail/2026081211013215964";

/** leagueKey → 리그 단위 중계. data/events.json 의 leagueKey 와 같은 이름을 쓴다. */
export const LEAGUE_BROADCAST: Readonly<Record<string, LeagueBroadcast>> = {
  epl: {
    outlets: [COUPANG_PLAY],
    checkedAt: "2026-11-27",
    sources: [
      // 프리미어리그 공식 중계사 목록(2025/26~2027/28): South Korea - Coupang
      "https://www.premierleague.com/en/media/broadcasters",
      // 2026-05 뉴시스: EPL 등 독점 중계는 스포츠 패스 가입 필요
      "https://mobile.newsis.com/view/NISX20260512_0003626314",
      MTN_COUPANG_LINEUP,
    ],
    until: "2028-06-30",
  },
  laliga: {
    outlets: [COUPANG_PLAY],
    checkedAt: "2026-11-27",
    sources: [
      // 2026-09 인사이트: 쿠팡플레이, 2026-27 라리가 7라운드 마드리드 더비 현지 생중계
      "https://www.insight.co.kr/news/574040",
      // 2026-08 일간스포츠: 라리가 아시아 대표가 쿠팡플레이와의 협력을 언급
      "https://isplus.com/article/view/isp202608120129",
      MTN_COUPANG_LINEUP,
    ],
    until: "2027-06-30",
  },
  bundesliga: {
    outlets: [COUPANG_PLAY],
    checkedAt: "2026-11-27",
    sources: [
      // 분데스리가 공식 나라별 중계사: South Korea - Coupang Play
      "https://www.bundesliga.com/en/bundesliga/info/broadcasters/south-korea/kr",
      // 2023-11: 쿠팡플레이가 2024-25 시즌부터 중계권 확보
      "https://www.sportcal.com/newsletters/coupang-play-to-take-over-bundesliga-rights-in-south-korea-from-2024-25/",
      MTN_COUPANG_LINEUP,
    ],
    until: "2027-06-30",
  },
  ucl: {
    outlets: [{ name: "SPOTV", kind: "TV", url: "https://www.spotv.net" }],
    note: "경기별 채널은 SPOTV 편성표 확인",
    checkedAt: "2026-11-27",
    sources: [
      // UEFA 공식 2026/27 중계사 목록: South Korea - SPO TV
      "https://www.uefa.com/uefachampionsleague/news/0253-0d82037aaedd-f371c464f919-1000--where-to-watch-the-champions-league-tv-broadcast-partne/",
    ],
    until: "2027-06-30",
  },
  kbl: {
    outlets: [{ name: "TVING", kind: "OTT", url: "https://www.tving.com/sports/kbl" }],
    note: "TV 중계는 경기마다 다름",
    checkedAt: "2026-11-27",
    sources: [
      // 2024-06 CJ ENM: 2024-25~2027-28 KBL 주관방송사, tvN SPORTS 등 채널 + 티빙 독점 스트리밍
      "https://cjnews.cj.net/cj-enm-%ED%94%84%EB%A1%9C%EB%86%8D%EA%B5%AC%EB%8F%84-%EC%86%90%EC%9E%A1%EC%95%98%EB%8B%A4-24-25%EC%8B%9C%EC%A6%8C%EB%B6%80%ED%84%B0-4%EB%85%84%EA%B0%84-kbl-%EB%B0%A9%EC%86%A1/",
      // 2026-06 CJ ENM: 티빙은 KBL OTT 단독 중계 파트너
      "https://cjnews.cj.net/?p=76836",
      // 티빙 KBL 관: "2026-2027 KCC 프로농구", 12월 3일 라이브 예정 경기 표시
      "https://www.tving.com/sports/kbl",
    ],
    until: "2028-06-30",
  },
  nba: {
    outlets: [COUPANG_PLAY],
    note: "주요 경기만 생중계",
    checkedAt: "2026-11-27",
    sources: [
      // 2026-10: 쿠팡플레이, 2026-27 NBA 주요 경기 생중계(스포츠 패스)
      "https://www.insight.co.kr/news/578394",
      "https://www.topstarnews.net/news/articleView.html?idxno=16252101",
      MTN_COUPANG_LINEUP,
    ],
    until: "2027-06-30",
  },
  kleague1: {
    outlets: [COUPANG_PLAY],
    note: "TV 중계는 경기마다 다름",
    checkedAt: "2026-11-27",
    sources: [
      // 2026-02: 쿠팡플레이, K리그1·2 전 경기 뉴미디어 독점 생중계 2030년까지
      "https://news.tf.co.kr/read/soccer/2295454.htm",
      // 2025-06 뉴시스: K리그는 와우 회원이면 스포츠 패스 없이 시청
      "https://mobile.newsis.com/view/NISX20250615_0003213650",
    ],
    until: "2030-12-31",
  },
};

export interface BroadcastLine {
  outlets: { name: string; url?: string; paid?: boolean }[];
  note?: string;
}

/** 외부 데이터에서 온 주소는 http(s)만 링크로 쓴다. */
function safeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : undefined;
}

/**
 * 이 경기를 어디서 보는지. 경기 자체에 broadcast 가 있으면 그것을 먼저 쓰고,
 * 없으면 리그 지도를 쓴다. 모르면 null — 화면은 중계 줄을 그리지 않는다.
 */
export function broadcastOf(event: SportEvent): BroadcastLine | null {
  if (event.status === "취소") return null;

  const own = event.broadcast?.filter((item) => item.name.trim().length > 0);
  if (own && own.length > 0) {
    return { outlets: own.map((item) => ({ name: item.name.trim(), url: safeUrl(item.url) })) };
  }

  const league = LEAGUE_BROADCAST[event.leagueKey];
  if (!league || league.outlets.length === 0) return null;
  if (league.until && event.dateKey > league.until) return null;
  return {
    outlets: league.outlets.map(({ name, url, paid }) => ({ name, url, paid })),
    note: league.note,
  };
}
