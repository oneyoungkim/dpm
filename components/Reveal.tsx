"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * 첫 화면 묶음 하나를 감싼다.
 * - 처음 화면에 보이는 묶음: CSS 애니메이션(.reveal)이 불러올 때 한 번 올라온다. 자바스크립트가 없어도 끝나면 보인다.
 * - 화면 아래쪽 묶음: 자바스크립트가 붙은 뒤에만 숨겼다가, 보일 때 한 번 올라온다.
 * 움직임 줄이기 설정이면 아무것도 하지 않는다(CSS도 애니메이션을 끈다).
 */
export function Reveal({
  children,
  index = 0,
  className,
}: {
  children: ReactNode;
  /** 첫 화면 묶음 순서. 묶음마다 50ms씩 늦게 시작한다. */
  index?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"idle" | "wait" | "in">("idle");

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // 이미 화면 안에 있으면 불러올 때의 애니메이션으로 충분하다.
    if (element.getBoundingClientRect().top < window.innerHeight) return;
    setPhase("wait");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPhase("in");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const classes = ["reveal", phase === "wait" ? "reveal-wait" : "", phase === "in" ? "reveal-in" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div ref={ref} className={classes} style={{ "--rise-i": index } as CSSProperties}>
      {children}
    </div>
  );
}
