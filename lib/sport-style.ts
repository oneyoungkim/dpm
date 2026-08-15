import type { Sport } from "./types";

/**
 * 종목 → 색/아이콘. 필터 칩, 카드 좌측 띠, 캘린더 점이 전부 이 표를 공유한다.
 * Tailwind가 클래스명을 정적으로 스캔하므로 문자열을 조립하지 않고 통째로 적어둔다.
 */
export const SPORT_STYLE: Record<
  Sport,
  { icon: string; dot: string; text: string; chipOn: string; bar: string }
> = {
  야구: {
    icon: "⚾",
    dot: "bg-sport-baseball",
    text: "text-sport-baseball",
    chipOn: "bg-sport-baseball text-ink-900 border-sport-baseball",
    bar: "bg-sport-baseball",
  },
  축구: {
    icon: "⚽",
    dot: "bg-sport-football",
    text: "text-sport-football",
    chipOn: "bg-sport-football text-ink-900 border-sport-football",
    bar: "bg-sport-football",
  },
  e스포츠: {
    icon: "🎮",
    dot: "bg-sport-esports",
    text: "text-sport-esports",
    chipOn: "bg-sport-esports text-ink-900 border-sport-esports",
    bar: "bg-sport-esports",
  },
  격투기: {
    icon: "🥊",
    dot: "bg-sport-fighting",
    text: "text-sport-fighting",
    chipOn: "bg-sport-fighting text-ink-900 border-sport-fighting",
    bar: "bg-sport-fighting",
  },
  농구: {
    icon: "🏀",
    dot: "bg-sport-basketball",
    text: "text-sport-basketball",
    chipOn: "bg-sport-basketball text-ink-900 border-sport-basketball",
    bar: "bg-sport-basketball",
  },
  배구: {
    icon: "🏐",
    dot: "bg-sport-volleyball",
    text: "text-sport-volleyball",
    chipOn: "bg-sport-volleyball text-ink-900 border-sport-volleyball",
    bar: "bg-sport-volleyball",
  },
  기타: {
    icon: "🏆",
    dot: "bg-sport-etc",
    text: "text-sport-etc",
    chipOn: "bg-sport-etc text-ink-900 border-sport-etc",
    bar: "bg-sport-etc",
  },
};
