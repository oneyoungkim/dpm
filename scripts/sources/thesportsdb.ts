import type { EventStatus, Sport, SportEvent, Team } from "../../lib/types";
import { dateKey } from "../../lib/kst";
import { fetchJson } from "../http";
import { koreanTeamName } from "./team-names";

/**
 * TheSportsDB 공개 API로 축구·농구·야구 일정을 모은다. 네이버 스포츠 대체용.
 *
 * 왜 이걸 쓰나 (2026-11 조사)
 *   - 네이버 api-gw 는 Node의 기본 TLS 핸드셰이크에 응답을 주지 않는다(curl은 됨).
 *     봇 차단으로 보이고 m.sports.naver.com robots.txt도 전체 Disallow라 우회하지 않는다.
 *   - 다음 스포츠 /prx/, KOVO user-api, KBL api 는 robots.txt로 막혀 있거나 비공개 헤더가 필요하다.
 *   - TheSportsDB는 공개 API로 내놓은 곳이고(무료 키 "123"), robots.txt도 API를 막지 않는다.
 *
 * 무료 키의 한계 — 설계가 여기서 나온다
 *   - 분당 30회. 요청 사이를 REQUEST_GAP_MS 만큼 띄운다(429면 http.ts가 1분 쉰다).
 *   - eventsnextleague 는 1건, eventsseason 은 앞 15건, eventsday 는 하루 3건까지만 준다.
 *   - eventsround 는 라운드 하나(축구 10경기)를 다 준다 → 축구는 라운드로 긁는다.
 *   - 라운드가 없는 리그(NBA·KBL)는 날짜로 긁는다. NBA는 하루 3경기만 잡힌다(무료 한계).
 *
 * strTimestamp 는 UTC다("2026-11-27T20:00:00", 오프셋 없음).
 */

const BASE = "https://www.thesportsdb.com/api/v1/json/123";

/**
 * 문서상 한도는 분당 30회지만, 실제로는 몰아서 보내면 Cloudflare가 몇 분씩 429를 준다(11-26 확인).
 * 3초 간격으로는 10번쯤마다 429에 걸려 한 번에 13분이 걸렸다. 6초 간격(분당 10회)이면
 * 기다림 없이 7분 남짓에 끝난다. 하루 한 번 도는 수집이라 느려도 괜찮다.
 */
const REQUEST_GAP_MS = 6_000;

/** 날짜 모드(NBA·KBL)는 하루 1요청이라 비싸다. 앞으로 2주만 본다. */
const DAY_MODE_DAYS = 14;

/** 라운드를 최대 몇 개까지 앞으로 볼지. 35일 창이면 축구는 5~6라운드면 충분하다. */
const MAX_ROUNDS = 8;

type Mode = "round" | "day";

interface League {
  id: string;
  sport: Sport;
  /** 화면 표시명 */
  name: string;
  /** lib/hype.ts LEAGUE_BASE 키 */
  key: string;
  mode: Mode;
  /** 라운드 번호 → 사람이 읽는 라운드 문구 */
  roundLabel?: (round: number) => string | undefined;
}

const LEAGUES: League[] = [
  { id: "4328", sport: "축구", name: "프리미어리그", key: "epl", mode: "round", roundLabel: (r) => `${r}라운드` },
  { id: "4335", sport: "축구", name: "라리가", key: "laliga", mode: "round", roundLabel: (r) => `${r}라운드` },
  { id: "4332", sport: "축구", name: "세리에A", key: "seriea", mode: "round", roundLabel: (r) => `${r}라운드` },
  { id: "4331", sport: "축구", name: "분데스리가", key: "bundesliga", mode: "round", roundLabel: (r) => `${r}라운드` },
  {
    id: "4480",
    sport: "축구",
    name: "챔피언스리그",
    key: "ucl",
    mode: "round",
    // 리그 페이즈는 1~8차전. 그 뒤 번호는 TheSportsDB가 토너먼트에 임의 숫자를 붙여서 문구를 안 단다.
    roundLabel: (r) => (r >= 1 && r <= 8 ? `리그 페이즈 ${r}차전` : undefined),
  },
  { id: "4689", sport: "축구", name: "K리그1", key: "kleague1", mode: "round", roundLabel: (r) => `${r}라운드` },
  { id: "4387", sport: "농구", name: "NBA", key: "nba", mode: "day" },
  { id: "5124", sport: "농구", name: "KBL", key: "kbl", mode: "day" },
  // 야구는 비시즌엔 다음 경기가 창 밖이라 요청 1번으로 끝난다.
  { id: "4830", sport: "야구", name: "KBO리그", key: "kbo", mode: "day" },
  { id: "4424", sport: "야구", name: "MLB", key: "mlb", mode: "day" },
];

interface SdbEvent {
  idEvent: string;
  strEvent?: string | null;
  strTimestamp?: string | null;
  dateEvent?: string | null;
  strTime?: string | null;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  strHomeTeamBadge?: string | null;
  strAwayTeamBadge?: string | null;
  intHomeScore?: string | number | null;
  intAwayScore?: string | number | null;
  intRound?: string | number | null;
  strVenue?: string | null;
  strStatus?: string | null;
  strPostponed?: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastRequestAt = 0;

/** 모든 요청을 한 줄로 세워 간격을 지킨다. */
async function sdb(path: string): Promise<SdbEvent[]> {
  const wait = lastRequestAt + REQUEST_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  const json = await fetchJson<{ events?: SdbEvent[] | null }>(`${BASE}/${path}`);
  return json?.events ?? [];
}

function toInt(v: string | number | null | undefined): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** UTC 타임스탬프 → 절대시각. 시각이 없으면(00:00:00이 아닌 빈 값) 날짜만 확정으로 본다. */
function startOf(e: SdbEvent): { startsAt: string; timeTbd: boolean } | null {
  if (e.strTimestamp) {
    const t = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(e.strTimestamp) ? e.strTimestamp : `${e.strTimestamp}Z`);
    if (!Number.isNaN(t)) return { startsAt: new Date(t).toISOString(), timeTbd: false };
  }
  if (e.dateEvent) {
    if (e.strTime && /^\d{2}:\d{2}/.test(e.strTime)) {
      const t = Date.parse(`${e.dateEvent}T${e.strTime.slice(0, 8)}Z`);
      if (!Number.isNaN(t)) return { startsAt: new Date(t).toISOString(), timeTbd: false };
    }
    return { startsAt: `${e.dateEvent}T12:00:00+09:00`, timeTbd: true };
  }
  return null;
}

function toStatus(e: SdbEvent, startsAt: string): EventStatus {
  const s = (e.strStatus ?? "").toLowerCase();
  if (/postp|cancel|abandon/.test(s) || /yes/i.test(e.strPostponed ?? "")) return "취소";
  if (/^(ft|aet|pen|aot|match finished|finished|ended)/.test(s)) return "종료";
  if (/^(1h|2h|ht|et|bt|p|live|q[1-4]|ot|in progress)/.test(s)) return "진행중";
  // 상태값이 비어 있는 경우가 많다. 점수가 있고 시작이 지났으면 끝난 경기로 본다.
  const scored = toInt(e.intHomeScore) !== undefined && toInt(e.intAwayScore) !== undefined;
  if (scored && Date.parse(startsAt) + 3 * 3600_000 < Date.now()) return "종료";
  return "예정";
}

function team(name: string, logo: string | null | undefined, score: number | undefined): Team {
  return { name, logo: logo || undefined, score };
}

function toEvent(league: League, e: SdbEvent): SportEvent | null {
  if (!e.idEvent || !e.strHomeTeam?.trim() || !e.strAwayTeam?.trim()) return null;
  const when = startOf(e);
  if (!when) return null;

  const status = toStatus(e, when.startsAt);
  const showScore = status === "종료" || status === "진행중";
  const home = koreanTeamName(e.strHomeTeam);
  const away = koreanTeamName(e.strAwayTeam);
  const round = toInt(e.intRound);

  return {
    id: `sdb-${e.idEvent}`,
    sport: league.sport,
    league: league.name,
    leagueKey: league.key,
    title: `${home} vs ${away}`,
    startsAt: when.startsAt,
    timeTbd: when.timeTbd || undefined,
    dateKey: dateKey(new Date(Date.parse(when.startsAt))),
    status,
    home: team(home, e.strHomeTeamBadge, showScore ? toInt(e.intHomeScore) : undefined),
    away: team(away, e.strAwayTeamBadge, showScore ? toInt(e.intAwayScore) : undefined),
    venue: e.strVenue || undefined,
    round: round && round > 0 ? league.roundLabel?.(round) : undefined,
    link: `https://www.thesportsdb.com/event/${e.idEvent}`,
    hype: 0,
    source: "TheSportsDB",
  };
}

function* daysBetween(from: string, to: string): Generator<string> {
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let i = 0; i < 400 && d <= end; i++) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

function addUtcDays(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** UTC 날짜와 KST 날짜가 하루 어긋날 수 있어 앞쪽을 하루 넓혀 본다. */
function utcWindow(from: string, to: string): { from: string; to: string } {
  return { from: addUtcDays(from, -1), to };
}

async function crawlLeague(league: League, from: string, to: string): Promise<SdbEvent[]> {
  const next = (await sdb(`eventsnextleague.php?id=${league.id}`))[0];
  const nextDate = next?.dateEvent ?? next?.strTimestamp?.slice(0, 10);
  // 다음 경기가 창 밖이거나 없으면(비시즌) 여기서 끝낸다.
  if (!next || !nextDate || nextDate > to) return [];

  if (league.mode === "round") {
    const start = toInt(next.intRound);
    if (!start || start <= 0) return [next];
    const out: SdbEvent[] = [];
    // 다음 경기가 든 라운드부터. 그 라운드에 이미 끝난 경기도 같이 온다.
    for (let r = start; r < start + MAX_ROUNDS; r++) {
      const events = await sdb(`eventsround.php?id=${league.id}&r=${r}&s=${encodeURIComponent(seasonOf(next))}`);
      if (events.length === 0) break;
      out.push(...events);
      const earliest = events.map((e) => e.dateEvent ?? "").filter(Boolean).sort()[0];
      if (earliest && earliest > to) break;
    }
    return out;
  }

  // 날짜 모드: 다음 경기 날짜 전은 비어 있을 테니(어제 결과 하루만 빼고) 건너뛴다.
  const w = utcWindow(from, to);
  const last = [w.to, addUtcDays(nextDate, DAY_MODE_DAYS)].sort()[0];
  const out: SdbEvent[] = [next];
  for (const day of daysBetween(nextDate, last)) {
    out.push(...(await sdb(`eventsday.php?d=${day}&l=${league.id}`)));
  }
  return out;
}

/** eventsnextleague 응답에 strSeason이 있으면 그걸, 없으면 날짜로 축구 시즌을 추정한다. */
function seasonOf(e: SdbEvent & { strSeason?: string | null }): string {
  if (e.strSeason) return e.strSeason;
  const y = Number((e.dateEvent ?? "").slice(0, 4));
  const m = Number((e.dateEvent ?? "").slice(5, 7));
  return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

export async function crawlTheSportsDb(from: string, to: string): Promise<SportEvent[]> {
  const byId = new Map<string, SportEvent>();
  const perLeague: string[] = [];

  for (const league of LEAGUES) {
    let n = 0;
    try {
      for (const raw of await crawlLeague(league, from, to)) {
        const event = toEvent(league, raw);
        if (!event || event.dateKey < from || event.dateKey > to) continue;
        if (!byId.has(event.id)) n++;
        byId.set(event.id, event);
      }
    } catch (err) {
      console.warn(`   ! ${league.name} 실패: ${err instanceof Error ? err.message : err}`);
    }
    perLeague.push(`${league.name} ${n}`);
  }

  console.log(`\n   (${perLeague.join(" · ")})`);
  return [...byId.values()];
}
