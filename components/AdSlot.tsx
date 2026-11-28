"use client";

import { useEffect, useRef } from "react";
import { BRAND } from "@/lib/brand";
import { isApp } from "@/lib/app/native";

/**
 * 광고 자리.
 * 게시자 ID(NEXT_PUBLIC_ADSENSE_CLIENT)와 자리 번호가 둘 다 있어야 광고 코드를 싣는다.
 * 없으면 배포 사이트에서는 아무것도 그리지 않고, 개발 화면에서만 점선 상자로 자리를 보여 준다.
 * 높이를 미리 잡아 두는 이유: 광고가 늦게 뜨면서 글이 밀리는 것(CLS)을 막으려고.
 */
const SLOT_IDS: Record<string, string> = {
  "home-top": process.env.NEXT_PUBLIC_AD_SLOT_HOME_TOP ?? "",
  "home-mid": process.env.NEXT_PUBLIC_AD_SLOT_HOME_MID ?? "",
  "rank-mid": process.env.NEXT_PUBLIC_AD_SLOT_RANK_MID ?? "",
  "article-mid": process.env.NEXT_PUBLIC_AD_SLOT_ARTICLE_MID ?? "",
  "article-end": process.env.NEXT_PUBLIC_AD_SLOT_ARTICLE_END ?? "",
  "article-rail": process.env.NEXT_PUBLIC_AD_SLOT_ARTICLE_RAIL ?? "",
  "list-mid": process.env.NEXT_PUBLIC_AD_SLOT_LIST_MID ?? "",
};

export type AdPlacement = keyof typeof SLOT_IDS;

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export function AdSlot({
  placement,
  shape = "banner",
}: {
  placement: AdPlacement;
  /** banner: 가로로 긴 자리, box: 글 사이 네모, rail: 옆 기둥 */
  shape?: "banner" | "box" | "rail";
}) {
  const pushed = useRef(false);
  const slot = SLOT_IDS[placement];
  const live = Boolean(BRAND.adsenseClient && slot);

  useEffect(() => {
    // 앱 안에서는 광고를 싣지 않는다(자리는 app-shell.css 가 숨긴다).
    if (!live || pushed.current || isApp()) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      // 광고 차단기 등으로 실패해도 본문은 그대로 보여야 한다.
    }
  }, [live]);

  if (!live) {
    if (process.env.NODE_ENV === "production") return null;
    return (
      <div className={`ad-slot ad-slot-${shape} ad-slot-placeholder`} aria-hidden>
        광고 자리 · {placement}
      </div>
    );
  }

  return (
    <aside className={`ad-slot ad-slot-${shape}`} aria-label="광고">
      <span className="ad-label">광고</span>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={BRAND.adsenseClient}
        data-ad-slot={slot}
        data-ad-format={shape === "rail" ? "vertical" : "auto"}
        data-full-width-responsive={shape === "rail" ? "false" : "true"}
      />
    </aside>
  );
}
