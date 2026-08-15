import type { SportEvent } from "../../lib/types";
import { fetchText } from "../http";

const ORIGIN = "https://www.blackcombat-official.com";
const CATEGORIES = ["BC", "N", "R", "C", "E"] as const;

function clean(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function inferRound(title: string): string | undefined {
  return title.match(/(?:결승|준결승|4강|8강|16강)/)?.[0];
}

export function parseBlackCombatPage(html: string, from: string, to: string): SportEvent[] {
  const events: SportEvent[] = [];
  for (const block of html.match(/<li\b[\s\S]*?<\/li>/gi) ?? []) {
    const sequence = block.match(/eventDetail\.php\?eventSeq=(\d+)/i)?.[1];
    const title = clean(block.match(/<b>([\s\S]*?)<\/b>/i)?.[1] ?? "");
    const date = block.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
    if (!sequence || !title || !date) continue;

    const dateKey = `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}`;
    if (dateKey < from || dateKey > to) continue;

    const venue = clean(
      block.match(/\d{4}년\s*\d{1,2}월\s*\d{1,2}일[\s\S]*?<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "",
    );
    events.push({
      id: `blackcombat-${sequence}`,
      sport: "격투기",
      category: "격투기",
      tags: ["격투기", "MMA", "블랙컴뱃"],
      series: "블랙컴뱃",
      league: "블랙컴뱃",
      leagueKey: "blackcombat",
      title,
      startsAt: `${dateKey}T12:00:00+09:00`,
      timeTbd: true,
      dateKey,
      status: "예정",
      venue: venue || undefined,
      round: inferRound(title),
      link: `${ORIGIN}/eventDetail.php?eventSeq=${sequence}`,
      hype: 0,
      source: "BLACK COMBAT",
      sourceUrl: `${ORIGIN}/eventDetail.php?eventSeq=${sequence}`,
      confidence: "confirmed",
    });
  }
  return events;
}

export async function crawlBlackCombat(from: string, to: string): Promise<SportEvent[]> {
  const pages = await Promise.all(
    CATEGORIES.map((category) => fetchText(`${ORIGIN}/event.php?eventCategory=${category}`)),
  );
  const merged = new Map<string, SportEvent>();
  for (const html of pages) {
    if (!html) continue;
    for (const event of parseBlackCombatPage(html, from, to)) merged.set(event.id, event);
  }
  return [...merged.values()];
}
