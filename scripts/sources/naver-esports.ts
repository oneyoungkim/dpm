import type { SportEvent, EventStatus } from "../../lib/types";
import { dateKey } from "../../lib/kst";
import { fetchJson } from "../http";

/**
 * 네이버 e스포츠(게임) 일정 API. 월 단위로만 조회된다.
 * startDate가 epoch ms라 타임존 문제가 없다.
 */

const ENDPOINT = "https://esports-api.game.naver.com/service/v2/schedule/month";

/** topLeagueId → 표시명/하이프 키. 롤 외 종목도 여기 한 줄 추가로 붙는다. */
const LEAGUES: Array<{ id: string; name: string; key: string }> = [
  { id: "lck", name: "LCK", key: "lck" },
  { id: "worlds", name: "롤드컵", key: "worlds" },
  { id: "msi", name: "MSI", key: "msi" },
  { id: "lck_cl", name: "LCK CL", key: "lck_cl" },
  { id: "valorant", name: "발로란트", key: "valorant" },
  { id: "overwatch", name: "오버워치", key: "overwatch" },
];

interface EsportsTeam {
  name?: string;
  nameAcronym?: string;
  imageUrl?: string;
}

interface EsportsMatch {
  gameId: string;
  topLeagueId: string;
  stadium?: string;
  startDate: number;
  title?: string;
  homeScore?: number;
  awayScore?: number;
  matchStatus?: string;
  homeTeam?: EsportsTeam;
  awayTeam?: EsportsTeam;
}

/** 대진 미정 자리표시자 */
function isTbd(name: string): boolean {
  return /^(tbd|tbc|미정|우승팀|승자)$/i.test(name.trim());
}

function toStatus(s?: string): EventStatus {
  if (s === "RESULT") return "종료";
  if (s === "STARTED" || s === "LIVE") return "진행중";
  return "예정";
}

/** from~to 구간이 걸쳐 있는 모든 "YYYY-MM"을 만든다. */
function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  const end = to.slice(0, 7);
  let cur = from.slice(0, 7);
  // 최대 24개월 — 무한 루프 방지용 상한
  for (let i = 0; i < 24; i++) {
    months.push(cur);
    if (cur === end) break;
    const [y, m] = cur.split("-").map(Number);
    cur = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return months;
}

export async function crawlNaverEsports(
  from: string,
  to: string,
): Promise<SportEvent[]> {
  const out: SportEvent[] = [];
  const seen = new Set<string>();

  for (const league of LEAGUES) {
    for (const month of monthsBetween(from, to)) {
      const url = `${ENDPOINT}?month=${month}&topLeagueId=${league.id}`;
      const json = await fetchJson<{ content?: { matches?: EsportsMatch[] } }>(url, {
        Referer: "https://game.naver.com/",
      });
      const matches = json?.content?.matches ?? [];

      for (const m of matches) {
        if (seen.has(m.gameId)) continue;
        seen.add(m.gameId);

        const d = new Date(m.startDate);
        const key = dateKey(d);
        if (key < from || key > to) continue;

        const status = toStatus(m.matchStatus);
        const showScore = status !== "예정";
        const homeName = m.homeTeam?.name ?? m.homeTeam?.nameAcronym;
        const awayName = m.awayTeam?.name ?? m.awayTeam?.nameAcronym;
        if (!homeName || !awayName) continue;

        // 플레이오프/결승은 대진이 나오기 전까지 양쪽이 TBD로 온다.
        // "TBD vs TBD"보다 라운드명("결승")이 훨씬 쓸모 있다. 리그명은 UI가 따로 붙인다.
        const bothTbd = isTbd(homeName) && isTbd(awayName);
        const title = bothTbd ? (m.title ?? "대진 미정") : `${homeName} vs ${awayName}`;

        out.push({
          id: `nes-${m.gameId}`,
          sport: "e스포츠",
          league: league.name,
          leagueKey: league.key,
          title,
          startsAt: d.toISOString(),
          dateKey: key,
          status,
          // 대진 미정이면 팀 칸을 아예 비운다 — "TBD" 두 개를 그릴 이유가 없다
          home: bothTbd
            ? undefined
            : { name: homeName, logo: m.homeTeam?.imageUrl, score: showScore ? m.homeScore : undefined },
          away: bothTbd
            ? undefined
            : { name: awayName, logo: m.awayTeam?.imageUrl, score: showScore ? m.awayScore : undefined },
          venue: m.stadium || undefined,
          round: m.title || undefined,
          link: "https://game.naver.com/esports/schedule",
          hype: 0,
          source: "네이버 e스포츠",
        });
      }
    }
  }

  return out;
}
