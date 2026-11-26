import Link from "next/link";
import { BRAND, NAV } from "@/lib/brand";
import { formatDateKo, todayKey } from "@/lib/kst";
import { NavLinks } from "./NavLinks";

/** 각도 기호(∠) 하나가 로고다. 꼭짓점의 빨간 점이 "지금"을 가리킨다. */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="brand-mark">
      <path d="M20.5 3.5 4 20.5h17" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinejoin="miter" />
      <rect x="1.5" y="18" width="5" height="5" fill="var(--accent)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="gak-wordmark">
      <BrandMark />
      <span>
        gak<em>.gg</em>
      </span>
    </span>
  );
}

export function SiteHeader() {
  return (
    <header className="gak-header">
      <Link href="/" className="gak-home" aria-label={`${BRAND.name} 처음으로`}>
        <Wordmark />
      </Link>
      <NavLinks items={NAV} />
      <p className="gak-date">
        <span>KST</span>
        {formatDateKo(todayKey())}
      </p>
    </header>
  );
}
