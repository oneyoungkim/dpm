import type { SportEvent } from "./types";

export const HIGHLIGHT_MIN_HYPE = 70;

/** 점수가 낮아도 DPMBROS의 핵심 레이더에서 놓치면 안 되는 대회들. */
const RADAR_PRIORITY_LEAGUES = new Set([
  "ufc_numbered",
  "ufc_fight_night",
  "blackcombat",
  "roadfc",
]);

export function isCuratedEvent(event: Pick<SportEvent, "hype" | "leagueKey">): boolean {
  return event.hype >= HIGHLIGHT_MIN_HYPE || RADAR_PRIORITY_LEAGUES.has(event.leagueKey);
}
