import { addDays } from "./kst";
import type { InterestCategory, Sport, SportEvent } from "./types";

/**
 * 자동 수집 소스를 붙이기 전 관심사 UX를 검증하기 위한 상대 날짜 예시.
 * preview 플래그가 있어 실제 일정과 구분되며 MATCHDAY_PREVIEW_EVENTS=0으로 한번에 끌 수 있다.
 */
export function buildPreviewEvents(today: string): SportEvent[] {
  const make = (
    offset: number,
    hour: number,
    event: {
      id: string;
      title: string;
      category: InterestCategory;
      sport?: Sport;
      series: string;
      tags: string[];
      hype: number;
      reason: string;
      mode?: SportEvent["eventMode"];
      timeTbd?: boolean;
    },
  ): SportEvent => {
    const key = addDays(today, offset);
    const hh = String(hour).padStart(2, "0");
    return {
      id: `preview:${event.id}:${key}`,
      sport: event.sport ?? "기타",
      category: event.category,
      tags: event.tags,
      series: event.series,
      league: event.series,
      leagueKey: `preview-${event.id}`,
      title: event.title,
      startsAt: `${key}T${hh}:00:00+09:00`,
      dateKey: key,
      timeTbd: event.timeTbd,
      status: "예정",
      hype: event.hype,
      hypeReason: event.reason,
      eventMode: event.mode ?? "scheduled",
      datePrecision: event.timeTbd ? "date" : "time",
      confidence: "expected",
      source: "Matchday 관심사 미리보기",
      preview: true,
    };
  };

  return [
    make(2, 10, {
      id: "playstation-showcase",
      title: "PlayStation Showcase",
      category: "게임",
      series: "PlayStation",
      tags: ["게임", "콘솔", "PlayStation", "신작 발표"],
      hype: 91,
      reason: "올해의 콘솔 신작 라인업이 공개되는 날.",
    }),
    make(3, 11, {
      id: "apple-event",
      title: "Apple Special Event",
      category: "테크",
      series: "Apple Event",
      tags: ["Apple", "iPhone", "신제품 발표"],
      hype: 94,
      reason: "차세대 iPhone이 무대에 오르는 순간.",
    }),
    make(4, 20, {
      id: "wbc-korea-japan",
      title: "대한민국 vs 일본",
      category: "빅 스포츠",
      sport: "야구",
      series: "WBC",
      tags: ["WBC", "대한민국", "일본", "국가대표"],
      hype: 98,
      reason: "설명이 필요 없는 한일전.",
    }),
    make(6, 19, {
      id: "galaxy-unpacked",
      title: "Galaxy Unpacked",
      category: "테크",
      series: "Samsung Galaxy",
      tags: ["Samsung", "Galaxy", "스마트폰", "신제품 발표"],
      hype: 88,
      reason: "삼성의 다음 플래그십이 공개된다.",
    }),
    make(7, 0, {
      id: "open-world-release",
      title: "대형 오픈월드 신작 글로벌 출시",
      category: "게임",
      series: "Game Release",
      tags: ["게임", "신작", "오픈월드", "출시"],
      hype: 86,
      reason: "오랫동안 기다린 세계가 자정에 열린다.",
      mode: "release-window",
    }),
    make(9, 23, {
      id: "super-bowl",
      title: "Super Bowl",
      category: "빅 스포츠",
      series: "NFL",
      tags: ["슈퍼볼", "NFL", "결승"],
      hype: 95,
      reason: "한 시즌을 결정하는 단 하나의 경기.",
    }),
    make(11, 22, {
      id: "wrestlemania",
      title: "WrestleMania",
      category: "격투기",
      sport: "격투기",
      series: "WWE",
      tags: ["WrestleMania", "WWE", "프로레슬링"],
      hype: 87,
      reason: "프로레슬링의 가장 거대한 밤.",
    }),
    make(13, 21, {
      id: "nintendo-direct",
      title: "Nintendo Direct",
      category: "게임",
      series: "Nintendo",
      tags: ["Nintendo", "Switch", "콘솔", "신작 발표"],
      hype: 90,
      reason: "예고 없이 큰 게임이 등장할 수 있는 40분.",
    }),
    make(15, 20, {
      id: "asian-games-opening",
      title: "아시안게임 개막식",
      category: "빅 스포츠",
      series: "Asian Games",
      tags: ["아시안게임", "대한민국", "국가대표"],
      hype: 84,
      reason: "아시아 최대 스포츠 축제가 시작된다.",
    }),
    make(17, 3, {
      id: "olympics-opening",
      title: "올림픽 개막식",
      category: "빅 스포츠",
      series: "Olympic Games",
      tags: ["올림픽", "대한민국", "국가대표"],
      hype: 97,
      reason: "전 세계가 같은 장면을 기다리는 날.",
    }),
    make(19, 22, {
      id: "wsop-final",
      title: "WSOP 메인 이벤트 파이널",
      category: "돈과 승부",
      series: "World Series of Poker",
      tags: ["포커", "WSOP", "파이널"],
      hype: 82,
      reason: "마지막 한 테이블에서 인생이 갈린다.",
    }),
    make(21, 18, {
      id: "collector-auction",
      title: "클래식카 컬렉터 경매 마감",
      category: "돈과 승부",
      series: "Collector Auction",
      tags: ["경매", "클래식카", "자동차"],
      hype: 76,
      reason: "희귀한 한 대의 주인이 결정되는 순간.",
    }),
    make(23, 21, {
      id: "lottery-draw",
      title: "이번 주 로또 추첨",
      category: "돈과 승부",
      series: "Lottery Draw",
      tags: ["복권", "추첨"],
      hype: 71,
      reason: "짧지만 모두가 결과를 확인하는 시간.",
    }),
    make(26, 14, {
      id: "electric-supercar",
      title: "차세대 전기 스포츠카 공개",
      category: "모터스포츠",
      series: "World Premiere",
      tags: ["자동차", "전기차", "신차 공개"],
      hype: 83,
      reason: "새로운 속도의 기준이 모습을 드러낸다.",
    }),
    make(28, 8, {
      id: "moon-mission",
      title: "민간 달 탐사선 발사",
      category: "특별 이벤트",
      series: "Space Mission",
      tags: ["우주", "달 탐사", "로켓 발사"],
      hype: 89,
      reason: "성공 여부를 전 세계가 함께 지켜보는 발사.",
    }),
  ];
}
