/**
 * 이름·주소·문구가 모이는 한 곳.
 * 이름을 바꿀 때는 이 파일만 고치면 머리말, 메타 정보, 구조화 데이터, 공유 이미지, RSS까지 따라 바뀐다.
 */
export const BRAND = {
  /** 검색에서 찾히는 한국어 이름. 제목 틀·사이트 이름·구조화 데이터가 이 값을 쓴다. */
  name: "각지지",
  /** 주소 꼴 이름(op.gg처럼). 화면 머리말의 글자 로고와 같은 표기. */
  domain: "gak.gg",
  /** 끝에 슬래시 없이. 대표 주소는 NEXT_PUBLIC_SITE_URL 이 정한다. */
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://gak.gg").replace(/\/$/, ""),
  tagline: "지금 뜰 각, 챙겨 볼 각",
  description:
    "커뮤니티 인기 키워드 순위, 30일 경기·출시 일정과 중계 채널, 하루 두 편 매거진.",
  /** G 아이콘(검정 바탕). 파비콘·앱 아이콘·구조화 데이터 로고가 모두 여기서 나온다. */
  logo: {
    /** 정사각 512px. Organization.logo 와 publisher.logo 에 쓴다. */
    square512: "/brand/gak-icon-512.png",
    /** 바탕을 뺀 작은 G. 머리말 글자 로고 옆에 22px로 놓는다. */
    mark: "/brand/gak-mark-64.png",
  },
  /** 같은 브랜드가 운영하는 바깥 계정(구조화 데이터 sameAs) */
  sameAs: [
    "https://www.youtube.com/@%EA%B0%81%EC%A7%80%EC%A7%80",
    "https://www.threads.com/@dpmbrothers",
  ],
  /** 공개 문의 메일. 비어 있으면 소개 페이지가 문의 줄을 숨긴다. */
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
  /**
   * 개인정보 처리방침의 문의 메일(앱 스토어 지원 연락처와 같은 주소).
   * 이 주소는 처리방침에만 싣는다. 값은 버셀 환경 변수로만 넣고 저장소에는 적지 않는다.
   */
  privacyEmail: process.env.NEXT_PUBLIC_PRIVACY_EMAIL || process.env.NEXT_PUBLIC_CONTACT_EMAIL || "",
  /** 애드센스 게시자 ID("ca-pub-…"). 비어 있으면 광고 코드를 아예 싣지 않는다. */
  adsenseClient: process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "",
  /** 검색 등록 확인 코드(구글 서치 콘솔, 네이버 서치어드바이저) */
  googleVerification: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION ?? "",
  naverVerification: process.env.NEXT_PUBLIC_NAVER_VERIFICATION ?? "",
} as const;

/** 검색 결과 기본 제목: "각지지 gak.gg · 지금 뜰 각, 챙겨 볼 각" */
export const SITE_TITLE = `${BRAND.name} ${BRAND.domain} · ${BRAND.tagline}`;

export const NAV = [
  { href: "/rank", label: "순위", sub: "뜰 각" },
  { href: "/schedule", label: "일정", sub: "볼 각" },
  { href: "/magazine", label: "매거진", sub: "읽을 각" },
] as const;

export function absoluteUrl(path = "/"): string {
  return `${BRAND.url}${path.startsWith("/") ? path : `/${path}`}`;
}
