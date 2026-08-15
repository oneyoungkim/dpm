import type { SportEvent, EventStatus } from "../../lib/types";
import { dateKey, todayKey } from "../../lib/kst";
import { fetchJson } from "../http";

/**
 * 격투기 일정.
 *
 * 1차 소스는 위키피디아 "List of UFC events"의 Scheduled events 표다.
 *   - 대회 이름/날짜/장소가 {{dts|...}} 로 기계가 읽기 좋게 박혀 있고 몇 달치가 다 들어있다.
 *   - 대신 개시 "시각"이 없다 → timeTbd 로 내보낸다.
 * 2차로 TheSportsDB에서 임박한 대회의 정확한 시각을 받아 덮어쓴다.
 *   - 무료 키는 응답 건수가 적어서 시각 보정 용도로만 쓴다.
 */

const WIKI = "https://en.wikipedia.org/w/api.php";
const SDB = "https://www.thesportsdb.com/api/v1/json/3";
const WIKI_UA = "matchday/0.1 (schedule aggregator)";

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/** 넘버링 대회는 파이트나이트보다 훨씬 큰 판이라 하이프 키를 나눈다. */
function leagueKeyOf(name: string): string {
  return /fight night|on abc|on espn|ultimate fighter/i.test(name)
    ? "ufc_fight_night"
    : "ufc_numbered";
}

/** "[[UFC Fight Night: Buckley vs. Malott]]" → "Buckley vs Malott" + 대회명 */
function prettify(raw: string): { title: string; round?: string } {
  const m = raw.match(/^(.*?):\s*(.+?\svs\.?\s.+)$/i);
  if (m) return { title: m[2].replace(/\bvs\.?/i, "vs"), round: m[1].trim() };
  return { title: raw };
}

/** 위키 링크/각주 마크업을 걷어내고 사람이 읽는 문자열만 남긴다. */
function stripWiki(s: string): string {
  return s
    .replace(/<ref[\s\S]*?(?:\/>|<\/ref>)/gi, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .trim();
}

interface WikiSection { index: string; line: string }

/** "Scheduled events" 섹션 번호는 문서가 바뀌면 밀린다. 매번 찾아서 쓴다. */
async function findScheduledSection(): Promise<string | null> {
  const json = await fetchJson<{ parse?: { sections?: WikiSection[] } }>(
    `${WIKI}?action=parse&page=List_of_UFC_events&prop=sections&format=json&formatversion=2`,
    { "User-Agent": WIKI_UA },
  );
  const hit = json?.parse?.sections?.find((s) => /^scheduled events$/i.test(s.line.trim()));
  return hit?.index ?? null;
}

async function crawlUfcWiki(from: string, to: string): Promise<SportEvent[]> {
  const section = await findScheduledSection();
  if (!section) {
    console.warn("   ! 위키피디아에서 Scheduled events 섹션을 못 찾았다");
    return [];
  }

  const json = await fetchJson<{ parse?: { wikitext?: string } }>(
    `${WIKI}?action=parse&page=List_of_UFC_events&prop=wikitext&section=${section}` +
      `&format=json&formatversion=2`,
    { "User-Agent": WIKI_UA },
  );
  const wikitext = json?.parse?.wikitext;
  if (!wikitext) return [];

  const out: SportEvent[] = [];

  // 표는 "|-" 로 행이 나뉘고, 각 행의 셀은 줄 첫머리 "|" 로 시작한다.
  for (const row of wikitext.split(/^\|-.*$/m).slice(1)) {
    const cells = row
      .split(/\n(?=\|)/)
      .map((c) => c.replace(/^\|\s*/, "").trim())
      .filter(Boolean);
    if (cells.length < 2) continue;

    const name = stripWiki(cells[0]);
    if (!name || !/ufc/i.test(name)) continue;

    const dts = cells[1].match(/\{\{\s*dts\s*\|(.+?)\}\}/i);
    if (!dts) continue;

    // {{dts|2026|Oct|24}} — format=... 같은 옵션 파라미터가 섞여 올 수 있다
    const parts = dts[1]
      .split("|")
      .map((p) => p.trim())
      .filter((p) => !p.includes("="));
    const [ys, ms, ds] = parts;
    const year = Number(ys);
    const month = MONTHS[ms?.slice(0, 3) as keyof typeof MONTHS];
    const day = Number(ds);
    if (!Number.isFinite(year) || month === undefined || !Number.isFinite(day)) continue;

    // 위키는 현지 날짜(대부분 미국 토요일 밤). 한국에선 다음날 낮에 본다.
    // 시각이 없으니 KST 정오로 두고 timeTbd 를 세워 UI가 "시간 미정"이라 말하게 한다.
    const startsAt = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00+09:00`;
    const key = dateKey(new Date(Date.parse(startsAt)));
    if (key < from || key > to) continue;

    const { title, round } = prettify(name);
    const venue = [stripWiki(cells[2] ?? ""), stripWiki(cells[3] ?? "")]
      .filter(Boolean)
      .join(", ");

    out.push({
      // 대회명으로 id를 만든다 — TheSportsDB 보정이 같은 대회를 찾아 덮어쓸 수 있게.
      id: `ufc-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      sport: "격투기",
      league: "UFC",
      leagueKey: leagueKeyOf(name),
      title,
      startsAt,
      timeTbd: true,
      dateKey: key,
      status: "예정",
      venue: venue || undefined,
      round: round ?? name,
      link: `https://en.wikipedia.org/wiki/${encodeURIComponent(name.replace(/\s/g, "_"))}`,
      hype: 0,
      source: "Wikipedia",
    });
  }

  return out;
}

interface SdbEvent {
  idEvent: string;
  strEvent: string;
  strTimestamp?: string | null;
  dateEvent?: string | null;
  strVenue?: string | null;
  strCity?: string | null;
}

/** TheSportsDB로 임박한 대회의 정확한 개시 시각을 채운다. 실패해도 무해하다. */
async function enrichTimes(events: SportEvent[]): Promise<void> {
  const json = await fetchJson<{ events?: SdbEvent[] | null }>(
    `${SDB}/eventsnextleague.php?id=4443`,
  );
  for (const e of json?.events ?? []) {
    if (!e.strTimestamp) continue;
    const ts = Date.parse(`${e.strTimestamp}Z`);
    if (Number.isNaN(ts)) continue;

    // "UFC 330 Makhachev vs Machado Garry" 에서 대회 번호/이름을 뽑아 매칭한다
    const tag = e.strEvent.match(/UFC\s+(?:Fight Night\s+)?\d+/i)?.[0];
    if (!tag) continue;
    const slug = tag.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    const target = events.find((x) => x.id === `ufc-${slug}`);
    if (!target) continue;

    target.startsAt = new Date(ts).toISOString();
    target.dateKey = dateKey(new Date(ts));
    target.timeTbd = false;
    target.venue ??= [e.strVenue, e.strCity].filter(Boolean).join(", ") || undefined;
  }
}

/** 지나간 대회는 "종료"로 표시한다. */
function markPast(events: SportEvent[]): void {
  const now = Date.now();
  const today = todayKey();
  for (const e of events) {
    // 시각 미정 이벤트의 startsAt은 정오라는 임시값이다. 그걸로 종료 판정을 하면
    // 대회 당일 낮 12시에 오늘 밤 경기가 끝난 것처럼 회색 처리된다. 날짜로만 본다.
    const past = e.timeTbd ? e.dateKey < today : Date.parse(e.startsAt) < now;
    if (past) e.status = "종료" as EventStatus;
  }
}

export async function crawlFighting(from: string, to: string): Promise<SportEvent[]> {
  const events = await crawlUfcWiki(from, to);
  await enrichTimes(events);
  markPast(events);
  // 시각 보정으로 날짜가 창 밖으로 밀릴 수 있어 마지막에 한 번 더 거른다
  return events.filter((e) => e.dateKey >= from && e.dateKey <= to);
}
