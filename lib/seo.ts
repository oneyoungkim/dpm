import type { Metadata } from "next";
import { BRAND, SITE_TITLE } from "./brand";

/**
 * 페이지 메타데이터 공통 틀.
 * Next는 하위 페이지가 openGraph·alternates 를 적으면 상위 값을 통째로 갈아 끼운다.
 * 그래서 페이지마다 canonical, RSS 링크, 공유 제목·주소·이미지를 빠짐없이 함께 적는다.
 */

/** 사이트 공용 공유 이미지(app/opengraph-image.tsx) */
const SITE_OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: SITE_TITLE };

/** 모든 페이지 머리에 싣는 매거진 RSS 링크 */
export const RSS_ALTERNATE = {
  "application/rss+xml": [{ url: "/feed.xml", title: `${BRAND.name} 매거진` }],
};

export function pageMetadata({
  title,
  description,
  path,
}: {
  /** 비우면 기본 제목(SITE_TITLE)을 쓴다. 넣으면 "%s | 각지지" 틀이 붙는다. */
  title?: string;
  description: string;
  /** 대표 주소가 될 사이트 안 경로("/rank") */
  path: string;
}): Metadata {
  const fullTitle = title ? `${title} | ${BRAND.name}` : SITE_TITLE;
  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: path, types: RSS_ALTERNATE },
    openGraph: {
      type: "website",
      title: fullTitle,
      description,
      url: path,
      siteName: BRAND.name,
      locale: "ko_KR",
      images: [SITE_OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [SITE_OG_IMAGE.url] },
  };
}
