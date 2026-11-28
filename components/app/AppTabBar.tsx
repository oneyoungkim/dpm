"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tap } from "@/lib/app/native";

/**
 * 앱 아래쪽 탭. 웹에서는 CSS(html.in-app 가 아닐 때)로 숨는다.
 * 처음 그릴 때부터 자리를 잡아 두어야 앱에서 화면이 밀리지 않아서 서버에서도 그린다.
 */
const TABS = [
  { href: "/", label: "홈", icon: "home" },
  { href: "/schedule", label: "일정", icon: "calendar" },
  { href: "/rank", label: "순위", icon: "rank" },
  { href: "/magazine", label: "매거진", icon: "book" },
  { href: "/alerts", label: "알림", icon: "bell" },
] as const;

function Icon({ name }: { name: (typeof TABS)[number]["icon"] }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
          <path d="M3.5 9.5h17M8 3v4M16 3v4M8 13.5h3M8 17h6" />
        </svg>
      );
    case "rank":
      return (
        <svg {...common}>
          <path d="M5 20V12M10 20V6M15 20v-9M20 20V9" />
        </svg>
      );
    case "book":
      return (
        <svg {...common}>
          <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />
        </svg>
      );
  }
}

export function AppTabBar() {
  const pathname = usePathname();
  return (
    <nav className="app-tabbar" aria-label="앱 메뉴">
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={active ? "app-tab app-tab-active" : "app-tab"}
            aria-current={active ? "page" : undefined}
            onClick={() => tap()}
          >
            <Icon name={tab.icon} />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
