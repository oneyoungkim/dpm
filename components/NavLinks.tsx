"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({
  items,
}: {
  items: ReadonlyArray<{ href: string; label: string; sub: string }>;
}) {
  const pathname = usePathname();
  return (
    <nav className="gak-nav" aria-label="주 메뉴">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? "gak-nav-link gak-nav-link-active" : "gak-nav-link"}
            aria-current={active ? "page" : undefined}
          >
            <strong>{item.label}</strong>
            <small>{item.sub}</small>
          </Link>
        );
      })}
    </nav>
  );
}
