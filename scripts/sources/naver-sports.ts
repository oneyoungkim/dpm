import type { Sport, SportEvent, EventStatus, Team } from "../../lib/types";
import { dateKey } from "../../lib/kst";
import { fetchJson } from "../http";

/**
 * 네이버 스포츠 통합 일정 API.
 * 야구(KBO/MLB/NPB) · 축구(K리그/EPL/라리가/…) · 농구 · 배구를 한 엔드포인트로 덮는다.
 * gameDateTime은 오프셋 없는 KST 벽시계 문자열("2026-08-15T19:00:00")로 온다.
 */

const ENDPOINT = "https://api-gw.sports.naver.com/schedule/games";

/** upperCategoryId → 대분류. 네이버가 새 리그를 추가해도 여기로 흡수된다. */
const UPPER: Array<{ id: string; sport: Sport }> = [
  { id: "kbaseball", sport: "야구" },
  { id: "wbaseball", sport: "야구" },
  { id: "kfootball", sport: "축구" },
  { id: "wfootball", sport: "축구" },
  { id: "basketball", sport: "농구" },
  { id: "volleyball", sport: "배구" },
];

/** categoryId → 하이프 테이블이 아는 leagueKey. 없으면 이름으로 추론한다. */
const LEAGUE_KEY: Record<string, string> = {
  kbo: "kbo",
  mlb: "mlb",
  npb: "npb",
  kleague: "kleague1",
  kleague2: "kleague2",
  koreacup: "kleague1",
  jleague: "j1",
  epl: "epl",
  primera: "laliga",
  seria: "seriea",
  bundesliga: "bundesliga",
  ligue1: "ligue1",
  mls: "mls",
  nba: "nba",
  kbl: "kbl",
  vleague: "vleague",
};

/** categoryId가 처음 보는 값일 때, 한글 리그명으로 leagueKey를 추론한다. */
function inferLeagueKey(categoryId: string, categoryName: string): string {
  if (LEAGUE_KEY[categoryId]) return LEAGUE_KEY[categoryId];
  const n = categoryName;
  // "잉글랜드 챔피언십"에 걸리지 않도록 '챔피언스'를 정확히 본다
  if (n.includes("챔피언스") && !n.includes("챔피언십")) return "ucl";
  if (n.includes("유로파")) return "uel";
  if (n.includes("아시아") && n.includes("챔피언")) return "acl";
  if (n.includes("월드컵")) return "worldcup";
  if (n.includes("A매치") || n.includes("국가대표")) return "korea_nt";
  return categoryId;
}

/** 이름만 있고 알맹이가 없는 껍데기 일정은 버린다(팀 미정 등). */
function isNoise(g: NaverGame): boolean {
  return !g.homeTeamName?.trim() || !g.awayTeamName?.trim();
}

function toStatus(g: NaverGame): EventStatus {
  if (g.cancel) return "취소";
  switch (g.statusCode) {
    case "RESULT":
      return "종료";
    case "STARTED":
      return "진행중";
    default:
      return "예정";
  }
}

interface NaverGame {
  gameId: string;
  categoryId: string;
  categoryName: string;
  gameDateTime: string;
  stadium?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamScore?: number;
  awayTeamScore?: number;
  homeTeamEmblemUrl?: string | null;
  awayTeamEmblemUrl?: string | null;
  statusCode?: string;
  statusInfo?: string;
  cancel?: boolean;
  roundName?: string;
}

function team(name?: string, logo?: string | null, score?: number): Team | undefined {
  if (!name?.trim()) return undefined;
  return { name: name.trim(), logo: logo ?? undefined, score };
}

export async function crawlNaverSports(
  from: string,
  to: string,
): Promise<SportEvent[]> {
  const out: SportEvent[] = [];

  for (const { id, sport } of UPPER) {
    const url =
      `${ENDPOINT}?fields=basic,categoryName,stadium,roundName` +
      `&upperCategoryId=${id}&fromDate=${from}&toDate=${to}&size=1000`;

    const json = await fetchJson<{ result?: { games?: NaverGame[] } }>(url, {
      Referer: "https://m.sports.naver.com/",
    });
    const games = json?.result?.games ?? [];

    for (const g of games) {
      if (isNoise(g)) continue;

      // 오프셋 없는 KST 벽시계 → 명시적 +09:00 을 붙여 절대시각으로 만든다
      const startsAt = `${g.gameDateTime}+09:00`;
      const t = Date.parse(startsAt);
      if (Number.isNaN(t)) continue;

      const status = toStatus(g);
      const showScore = status !== "예정";

      out.push({
        id: `naver-${g.gameId}`,
        sport,
        league: g.categoryName,
        leagueKey: inferLeagueKey(g.categoryId, g.categoryName),
        title: `${g.homeTeamName} vs ${g.awayTeamName}`,
        startsAt,
        dateKey: dateKey(new Date(t)),
        status,
        statusNote: g.statusInfo || undefined,
        home: team(g.homeTeamName, g.homeTeamEmblemUrl, showScore ? g.homeTeamScore : undefined),
        away: team(g.awayTeamName, g.awayTeamEmblemUrl, showScore ? g.awayTeamScore : undefined),
        venue: g.stadium || undefined,
        round: g.roundName || undefined,
        link: `https://m.sports.naver.com/game/${g.gameId}`,
        hype: 0, // crawl.ts 에서 일괄 산정
        source: "네이버 스포츠",
      });
    }
  }

  return out;
}
