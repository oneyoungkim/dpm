import type { InterestCategory, Sport, SportEvent } from "./types";
import { INTEREST_CATEGORIES } from "./types";

export const INTEREST_STYLE: Record<
  InterestCategory,
  { dot: string; bar: string; description: string }
> = {
  축구: { dot: "bg-sport-football", bar: "bg-sport-football", description: "대표팀, 유럽축구, 라이벌전" },
  야구: { dot: "bg-sport-baseball", bar: "bg-sport-baseball", description: "KBO, MLB, WBC 주요 경기" },
  격투기: { dot: "bg-sport-fighting", bar: "bg-sport-fighting", description: "UFC, 복싱, 프로레슬링" },
  e스포츠: { dot: "bg-sport-esports", bar: "bg-sport-esports", description: "LoL, Valorant, 국제대회" },
  농구: { dot: "bg-sport-basketball", bar: "bg-sport-basketball", description: "NBA와 국가대표 주요 경기" },
  모터스포츠: { dot: "bg-interest-motor", bar: "bg-interest-motor", description: "F1, 모터쇼, 신차 공개" },
  "기타 스포츠": { dot: "bg-sport-volleyball", bar: "bg-sport-volleyball", description: "배구와 놓치기 아쉬운 경기" },
  "빅 스포츠": { dot: "bg-interest-major", bar: "bg-interest-major", description: "올림픽, 월드컵, WBC, 슈퍼볼" },
  게임: { dot: "bg-interest-games", bar: "bg-interest-games", description: "대형 출시와 콘솔 쇼케이스" },
  테크: { dot: "bg-interest-tech", bar: "bg-interest-tech", description: "Apple, Samsung, 주요 제품 발표" },
  "돈과 승부": { dot: "bg-interest-stakes", bar: "bg-interest-stakes", description: "경매 마감, 포커 결승, 추첨" },
  "특별 이벤트": { dot: "bg-interest-special", bar: "bg-interest-special", description: "우주 발사와 역사적인 발표" },
};

const SPORT_CATEGORY: Record<Sport, InterestCategory> = {
  축구: "축구",
  야구: "야구",
  격투기: "격투기",
  e스포츠: "e스포츠",
  농구: "농구",
  배구: "기타 스포츠",
  기타: "기타 스포츠",
};

export function interestCategoryOf(event: SportEvent): InterestCategory {
  return event.category ?? SPORT_CATEGORY[event.sport];
}

export function activeInterestCategories(events: SportEvent[]): InterestCategory[] {
  const present = new Set(events.map(interestCategoryOf));
  return INTEREST_CATEGORIES.filter((category) => present.has(category));
}

export const DEFAULT_INTERESTS: InterestCategory[] = ["축구", "격투기", "e스포츠", "게임", "테크"];
