import { NextResponse } from "next/server";
import { loadEvents } from "@/lib/events";
import { SPORTS, type Sport } from "@/lib/types";

/**
 * 앱(과 나중의 푸시 워커)이 쓸 읽기 전용 엔드포인트.
 * 웹 화면은 서버 컴포넌트에서 직접 읽으므로 이 라우트를 거치지 않는다.
 *
 *   GET /api/events
 *   GET /api/events?sport=야구,e스포츠&minHype=70&from=2026-08-20&to=2026-08-31&limit=50
 */

export const revalidate = 600;

const isSport = (s: string): s is Sport => (SPORTS as readonly string[]).includes(s);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const data = loadEvents();

  const sportParam = searchParams.get("sport");
  const wanted = new Set(
    (sportParam?.split(",") ?? [])
      .map((s) => s.trim())
      .filter(isSport),
  );

  const minHype = Number(searchParams.get("minHype") ?? 0);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // limit은 최대 500까지만. 잘못된 값이 와도 전체를 토해내지 않게 막는다.
  const rawLimit = Number(searchParams.get("limit") ?? 200);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 200;

  let events = data.events;
  if (wanted.size) events = events.filter((e) => wanted.has(e.sport));
  if (Number.isFinite(minHype) && minHype > 0) events = events.filter((e) => e.hype >= minHype);
  if (from) events = events.filter((e) => e.dateKey >= from);
  if (to) events = events.filter((e) => e.dateKey <= to);

  const total = events.length;

  return NextResponse.json({
    generatedAt: data.generatedAt,
    range: data.range,
    total,
    returned: Math.min(total, limit),
    events: events.slice(0, limit),
  });
}
