import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/alerts"] }],
    // 전체 사이트맵과, 최근 48시간 글만 담은 뉴스 사이트맵
    sitemap: [absoluteUrl("/sitemap.xml"), absoluteUrl("/news-sitemap.xml")],
  };
}
