import Link from "next/link";
import { BRAND, NAV } from "@/lib/brand";
import { formatDateKo, todayKey } from "@/lib/kst";
import { NavLinks } from "./NavLinks";

/** 트랙 선 G 아이콘 하나가 로고다. 오른쪽 위 빨간 점이 "지금"을 가리킨다. 바로 옆에 글자 로고가 있어 alt는 비운다. */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    // 64px짜리 작은 그림 하나라 next/image 변환을 거치지 않는다.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={BRAND.logo.mark} width={size} height={size} alt="" aria-hidden className="brand-mark" decoding="async" />
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
