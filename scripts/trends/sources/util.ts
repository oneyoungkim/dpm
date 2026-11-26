/** 목록 파서들이 같이 쓰는 작은 도구. */

/** "6,143", " (18) ", "[197]" 같은 글자에서 숫자를 뽑는다. 없으면 null */
export function toNumber(text: string | undefined | null): number | null {
  if (!text) return null;
  const m = text.replace(/,/g, "").match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

/** 공백 정리 */
export function clean(text: string | undefined | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

export function absolute(href: string | undefined, base: string): string {
  if (!href) return "";
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
}
