/**
 * 이름·주소·문구가 모이는 한 곳.
 * 이름을 바꿀 때는 이 파일만 고치면 머리말, 메타 정보, 공유 이미지, RSS까지 따라 바뀐다.
 */
export const BRAND = {
  /** 주소 꼴 그대로가 이름이다(op.gg처럼). */
  name: "gak.gg",
  nameKo: "각",
  /** 끝에 슬래시 없이. 도메인을 연결하면 NEXT_PUBLIC_SITE_URL만 바꾼다. */
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://dpm-five.vercel.app").replace(/\/$/, ""),
  tagline: "지금 뜰 각, 챙겨 볼 각",
  description:
    "커뮤니티 인기 키워드 순위, 30일 경기·출시 일정과 중계 채널, 하루 두 편 매거진.",
  /** 공개 문의 메일. 비어 있으면 소개 페이지가 문의 줄을 숨긴다. */
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
  /** 애드센스 게시자 ID("ca-pub-…"). 비어 있으면 광고 코드를 아예 싣지 않는다. */
  adsenseClient: process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "",
  /** 검색 등록 확인 코드(구글 서치 콘솔, 네이버 서치어드바이저) */
  googleVerification: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION ?? "",
  naverVerification: process.env.NEXT_PUBLIC_NAVER_VERIFICATION ?? "",
} as const;

export const NAV = [
  { href: "/rank", label: "순위", sub: "뜰 각" },
  { href: "/schedule", label: "일정", sub: "볼 각" },
  { href: "/magazine", label: "매거진", sub: "읽을 각" },
] as const;

export function absoluteUrl(path = "/"): string {
  return `${BRAND.url}${path.startsWith("/") ? path : `/${path}`}`;
}
