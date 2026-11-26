import Link from "next/link";
import { BRAND, NAV } from "@/lib/brand";
import { Wordmark } from "./SiteHeader";

export function SiteFooter() {
  return (
    <footer className="gak-footer">
      <div className="gak-footer-brand">
        <Wordmark />
        <p>{BRAND.tagline}</p>
      </div>
      <nav aria-label="바닥 메뉴" className="gak-footer-nav">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
        <Link href="/about">소개·편집 원칙</Link>
        <Link href="/privacy">개인정보 처리방침</Link>
        <a href="/feed.xml">RSS</a>
      </nav>
      <div className="gak-footer-note">
        <p>일정과 시각은 한국 시간 기준이고, 주최 측 사정으로 바뀔 수 있습니다.</p>
        <p>키워드 순위는 공개 게시판 목록의 제목을 세어 만든 통계이며, 각 글의 내용과 권리는 원 작성자에게 있습니다.</p>
      </div>
    </footer>
  );
}
