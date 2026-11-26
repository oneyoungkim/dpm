/**
 * 작은 robots.txt 해석기.
 * 우리 요청은 일반 브라우저 UA 라 "User-agent: *" 묶음만 따른다.
 * 규칙: 가장 긴(구체적인) 경로가 이긴다, 같은 길이면 Allow 가 이긴다(구글 방식). * 와 $ 지원.
 */

export interface RobotsRule {
  allow: boolean;
  pattern: string;
}

export interface Robots {
  rules: RobotsRule[];
  crawlDelay: number | null;
}

export function parseRobots(text: string): Robots {
  const rules: RobotsRule[] = [];
  let crawlDelay: number | null = null;
  // 묶음: 연속된 User-agent 줄 + 그 뒤 규칙 줄
  let agents: string[] = [];
  let inRules = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (inRules) {
        agents = [];
        inRules = false;
      }
      agents.push(value.toLowerCase());
      continue;
    }
    inRules = true;
    if (!agents.includes("*")) continue;
    if (field === "allow" || field === "disallow") {
      // 빈 Disallow 는 "다 허용"이라 규칙이 아니다
      if (!value) continue;
      rules.push({ allow: field === "allow", pattern: value });
    } else if (field === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n)) crawlDelay = n;
    }
  }
  return { rules, crawlDelay };
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

export function isAllowed(robots: Robots, pathWithQuery: string): boolean {
  let best: RobotsRule | null = null;
  for (const rule of robots.rules) {
    if (!patternToRegex(rule.pattern).test(pathWithQuery)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

/**
 * robots.txt 를 읽는다. 404 등 4xx 는 "규칙 없음"(전부 허용), 5xx·네트워크 실패는 null(쓰지 않음).
 */
export async function loadRobots(
  origin: string,
  get: (url: string) => Promise<{ status: number; text: string } | null>,
): Promise<Robots | null> {
  let res = await get(`${origin}/robots.txt`);
  // 한 번 끊긴 것(타임아웃·5xx)으로 그 소스 전체를 버리지 않게 3초 뒤 한 번만 더 읽는다
  if (!res || res.status >= 500) {
    await new Promise((r) => setTimeout(r, 3_000));
    res = await get(`${origin}/robots.txt`);
  }
  if (!res) return null;
  if (res.status >= 500) return null;
  if (res.status >= 400) return { rules: [], crawlDelay: null };
  // 사이트가 robots.txt 자리에 HTML 오류 페이지를 주는 경우(핫벤) — 규칙 없음으로 본다
  if (/^\s*<(!doctype|html)/i.test(res.text)) return { rules: [], crawlDelay: null };
  return parseRobots(res.text);
}
