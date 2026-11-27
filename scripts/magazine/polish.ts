/**
 * 매거진 글 윤문(문장 다듬기) 도구.
 * 글은 작성자가 쓰고 사실 확인까지 끝낸 뒤, 다른 모델(제미나이)에게는 문장 다듬기만 맡긴다.
 * 이 도구는 그 앞뒤를 맡는다: 지시문 만들기, 그리고 돌아온 결과가 사실을 건드리지 않았는지 대조한 뒤에만 반영하기.
 *
 *   npm run magazine:polish -- prompt content/articles/<파일>.md <작업폴더>
 *     → <작업폴더>/polish_prompt.md (붙여 넣을 지시문), polish_meta.json (붙여 넣기 확인용 글자 수)
 *   npm run magazine:polish -- apply content/articles/<파일>.md <윤문결과.md>
 *     → 숫자·따옴표 인용·영문 표기·표·소제목 수가 같을 때만 글 파일을 고쳐 쓴다. 다르면 고치지 않고 종료 코드 2.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type Split = { front: string; title: string; deck: string; body: string };

function splitArticle(raw: string): Split {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error("머리말(---)을 찾지 못함");
  const front = m[1];
  const title = front.match(/^title:\s*"(.*)"\s*$/m)?.[1] ?? "";
  const deck = front.match(/^deck:\s*"(.*)"\s*$/m)?.[1] ?? "";
  return { front, title, deck, body: m[2].trim() };
}

export function buildPrompt(a: Split): string {
  const chars = a.body.replace(/\s/g, "").length;
  const lo = Math.round(chars * 0.92);
  const hi = Math.round(chars * 1.08);
  return `너는 한국 남자 커뮤니티(에펨코리아·디시·루리웹)를 매일 보는 30대 잡지 에디터다. 아래 매거진 글을 윤문해 줘.

목표: AI가 쓴 티를 없애는 것. 아는 형이 술자리에서 설명해 주듯 자연스럽게 읽혀야 한다. 보고서체, 번역투, 매끈하게 다듬은 기계 문장을 걷어 내라. 문장 순서를 바꾸거나 두 문장을 합치고 나누는 것은 괜찮다.

꼭 지킬 것
1. 사실은 한 글자도 바꾸지 않는다. 숫자, 날짜, 사람·회사 이름, 매체 이름, 따옴표 안 인용문은 그대로 둔다. 새로운 사실이나 추측, 평가를 더하지 않는다. 원문에 있는 사실을 빼지도 않는다.
2. 마크다운 구조를 지킨다. ## 소제목의 개수와 순서, 표, 문단 순서를 그대로 둔다. 소제목 문구는 더 짧고 구체적으로 고쳐도 된다.
3. 말투는 "~니다"가 기본이고, 이어 말하는 자리에 "~죠", "~거든요", "~는데요"를 섞는다. "~해요", "~예요"는 쓰지 않는다.
4. 쓰지 말 것: 줄표, 화살표, "중요한 것은", "핵심은", "~인 셈입니다", "주목할 만합니다", "시사합니다", "귀추가 주목됩니다", "그 어느 때보다", "역대급", "충격", "놀라운", "솔직히", "여러분", 답하지 않는 질문, "~를 알아보겠습니다" 같은 진행 멘트, 사람을 "그는/그녀는"으로 받는 것.
5. 같은 길이의 문장을 늘어놓지 말고 길고 짧은 문장을 섞는다. 셋씩 나열하는 버릇을 피한다.
6. 분량은 원문과 비슷하게(공백 빼고 ${lo.toLocaleString()}~${hi.toLocaleString()}자).

출력: 윤문한 본문만, \`\`\`markdown 코드 블록 하나에 담아서. 앞뒤 설명은 쓰지 않는다. 제목과 부제도 다듬어서 코드 블록 안 맨 위에 "제목: …", "부제: …" 두 줄로 먼저 적어 줘(제목 40자 이하, 부제 90자 이하, 느낌표 금지).

현재 제목: ${a.title}
현재 부제: ${a.deck}

--- 원문 ---
${a.body}
`;
}

/** 붙여 넣은 뒤 입력창 글자와 맞춰 보는 값. 편집기가 목록 번호·글머리표를 지우므로 그 기호는 세지 않는다. */
function pasteMeta(text: string) {
  const s = text.normalize("NFC").replace(/^\s*(\d+\.|-)\s+/gm, "").replace(/\s+/g, "");
  return { chars: s.length, hangul: (s.match(/[가-힣]/g) ?? []).length };
}

type Facts = { nums: Map<string, number>; quotes: string[]; latin: Map<string, number>; tableRows: number; headings: number };

function count(list: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of list) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

export function factsOf(body: string): Facts {
  const t = body.replace(/^(제목|부제):.*$/gm, "");
  const nums = (t.match(/\d[\d,.]*\s?(?:조|억|만|%|달러|원|배|개|곳|번|년|월|일|시|분|위|자|명|회|점|경기|승|패|kg|km|cm|mm)?/g) ?? []).map((n) =>
    n.replace(/\s/g, "").replace(/[.,]$/, ""),
  );
  const quotes = [...t.matchAll(/["“]([^"”\n]{4,})["”]/g)].map((m) => m[1].trim());
  const latin = t.match(/[A-Za-z][A-Za-z0-9.&+-]*/g) ?? [];
  return {
    nums: count(nums),
    quotes,
    latin: count(latin.map((w) => w.replace(/\.$/, ""))),
    tableRows: (t.match(/^\|.*\|\s*$/gm) ?? []).length,
    headings: (t.match(/^## /gm) ?? []).length,
  };
}

function diffCounts(a: Map<string, number>, b: Map<string, number>): { onlyA: string[]; onlyB: string[] } {
  const onlyA: string[] = [];
  const onlyB: string[] = [];
  for (const [k, v] of a) if ((b.get(k) ?? 0) < v) onlyA.push(`${k}×${v - (b.get(k) ?? 0)}`);
  for (const [k, v] of b) if ((a.get(k) ?? 0) < v) onlyB.push(`${k}×${v - (a.get(k) ?? 0)}`);
  return { onlyA, onlyB };
}

/** 영문 낱말이 하나 더해지는 것(예: 소제목의 CEO)은 본문에 이미 있는 낱말이면 봐준다. */
export function compareFacts(before: string, after: string): string[] {
  const a = factsOf(before);
  const b = factsOf(after);
  const problems: string[] = [];
  const n = diffCounts(a.nums, b.nums);
  if (n.onlyA.length || n.onlyB.length) problems.push(`숫자 달라짐: 원문에만 [${n.onlyA.join(", ")}] / 윤문에만 [${n.onlyB.join(", ")}]`);
  const lostQ = a.quotes.filter((q) => !b.quotes.includes(q));
  const newQ = b.quotes.filter((q) => !a.quotes.includes(q));
  if (lostQ.length || newQ.length) problems.push(`따옴표 인용 달라짐: 원문에만 ${JSON.stringify(lostQ)} / 윤문에만 ${JSON.stringify(newQ)}`);
  const l = diffCounts(a.latin, b.latin);
  const newLatin = l.onlyB.filter((w) => !a.latin.has(w.replace(/×\d+$/, "")));
  if (l.onlyA.length || newLatin.length) problems.push(`영문 표기 달라짐: 원문에만 [${l.onlyA.join(", ")}] / 윤문에만 [${newLatin.join(", ")}]`);
  if (a.tableRows !== b.tableRows) problems.push(`표 줄 수 달라짐: ${a.tableRows} → ${b.tableRows}`);
  if (a.headings !== b.headings) problems.push(`소제목 수 달라짐: ${a.headings} → ${b.headings}`);
  return problems;
}

function parseResult(raw: string): { title?: string; deck?: string; body: string } {
  let t = raw.replace(/\r\n/g, "\n").trim();
  const fence = t.match(/```(?:markdown|md)?\n([\s\S]*?)\n```/);
  if (fence) t = fence[1].trim();
  const title = t.match(/^제목:\s*(.+)$/m)?.[1].trim();
  const deck = t.match(/^부제:\s*(.+)$/m)?.[1].trim();
  const body = t.replace(/^(제목|부제):.*\n?/gm, "").trim();
  return { title, deck, body };
}

function yamlQuote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function main() {
  const [mode, file, other] = process.argv.slice(2);
  if (!mode || !file || !other || !["prompt", "apply"].includes(mode)) {
    console.error("사용법: npm run magazine:polish -- prompt <글.md> <작업폴더> | apply <글.md> <윤문결과.md>");
    process.exit(1);
  }
  const raw = readFileSync(file, "utf-8");
  const a = splitArticle(raw);

  if (mode === "prompt") {
    mkdirSync(other, { recursive: true });
    const prompt = buildPrompt(a);
    writeFileSync(join(other, "polish_prompt.md"), prompt, "utf-8");
    writeFileSync(join(other, "polish_meta.json"), JSON.stringify(pasteMeta(prompt), null, 2), "utf-8");
    console.log(`지시문: ${join(other, "polish_prompt.md")} (붙여 넣은 뒤 확인값 ${JSON.stringify(pasteMeta(prompt))})`);
    return;
  }

  const r = parseResult(readFileSync(other, "utf-8"));
  const problems = compareFacts(a.body, r.body);
  if (r.title && r.title.length > 40) problems.push(`제목이 40자를 넘음(${r.title.length}자)`);
  if (r.deck && r.deck.length > 90) problems.push(`부제가 90자를 넘음(${r.deck.length}자)`);
  if (/[—→]/.test(`${r.title ?? ""}${r.deck ?? ""}${r.body}`)) problems.push("줄표나 화살표가 들어감");
  if (problems.length) {
    console.log("[반영 안 함] 윤문 결과가 사실이나 형식을 건드렸습니다. 원문을 그대로 씁니다.");
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(2);
  }
  let front = a.front;
  if (r.title) front = front.replace(/^title:.*$/m, `title: ${yamlQuote(r.title)}`);
  if (r.deck) front = front.replace(/^deck:.*$/m, `deck: ${yamlQuote(r.deck)}`);
  writeFileSync(file, `---\n${front}\n---\n\n${r.body}\n`, "utf-8");
  const len = (s: string) => s.replace(/\s/g, "").length;
  console.log(`[반영] 숫자·인용·영문·표·소제목 수가 같습니다. 본문 ${len(a.body)}자 → ${len(r.body)}자`);
  if (r.title && r.title !== a.title) console.log(`  제목: ${a.title} → ${r.title}`);
  if (r.deck && r.deck !== a.deck) console.log(`  부제: ${a.deck} → ${r.deck}`);
  console.log("  이어서 npm run magazine:check 로 검사하세요.");
}

if (process.argv[1]?.endsWith("polish.ts")) main();
