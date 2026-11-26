import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { checkFiles, type FileReport } from "./check";

/**
 * check.ts 자기 시험.
 *   npx tsx scripts/magazine/selftest.ts
 *
 * fixtures/ 의 시험 글마다 "반드시 나와야 하는 오류·경고"와 "나오면 안 되는 오류"를 적어 두고 맞춰 본다.
 * 최근 글 비교는 fixtures/recent/ 를 쓴다(content/articles 는 건드리지 않는다).
 * 하나라도 어긋나면 종료 코드 1.
 */

const DIR = join(process.cwd(), "scripts", "magazine", "fixtures");
const RECENT = join(DIR, "recent");

interface Expect {
  /** 이 오류 규칙이 모두 나와야 한다 */
  errors?: string[];
  /** 이 경고 규칙이 모두 나와야 한다 */
  warnings?: string[];
  /** 오류가 하나도 없어야 한다 */
  pass?: boolean;
  /** 경고도 없어야 한다 */
  clean?: boolean;
  /** 이 오류 규칙은 나오면 안 된다 */
  notErrors?: string[];
  /** 참고(글자 그대로 쓴 말) 수 하한 */
  minNotes?: number;
  /** 근거 주소를 실제로 열어 본다 */
  online?: boolean;
}

const CASES: Record<string, Expect> = {
  "2026-12-05-ufc-1-royce-gracie.md": { pass: true, clean: true },
  "2026-12-06-bad-schema.md": { errors: ["schema"] },
  "2026-12-06-bad-filename.md": { errors: ["filename"] },
  "2026-12-06-oliveira-lopes-preview.md": { errors: ["slug-dup"] },
  "2026-12-06-bad-length.md": { errors: ["body-length"], notErrors: ["h2-count"] },
  "2026-12-06-bad-h2.md": { errors: ["h2-count"] },
  "2026-12-06-bad-markup.md": { errors: ["h1", "html", "body-image"] },
  "2026-12-06-bad-sources-host.md": { errors: ["sources-hosts"] },
  "2026-12-06-bad-sources-dupe.md": { errors: ["sources-count", "sources-hosts"] },
  "2026-12-06-bad-sources-banned.md": { errors: ["source-banned-host"] },
  "2026-12-06-bad-dash.md": { errors: ["dash-arrow"] },
  "2026-12-06-bad-passive.md": { errors: ["double-passive"] },
  "2026-12-06-bad-progress.md": { errors: ["progress-remark"] },
  "2026-12-06-bad-opening.md": { errors: ["opening-greeting"] },
  "2026-12-06-bad-gwichu.md": { errors: ["closing-formula-hard"] },
  "2026-12-06-bad-abstract.md": { errors: ["abstract-word"] },
  "2026-12-06-bad-cliche.md": { errors: ["cliche"] },
  "2026-12-06-bad-streak.md": { errors: ["seumnida-streak"], warnings: ["short-stack"] },
  "2026-12-06-bad-topic.md": {
    errors: ["topic-gambling", "topic-adult", "topic-hate", "topic-invest", "topic-medical"],
  },
  "2026-11-25-bad-recent.md": { errors: ["recent-overlap"] },
  "2026-12-03-bad-category.md": { errors: ["category-streak"] },
  "2026-12-06-bad-title.md": { errors: ["title-banned"] },
  "2026-12-06-bad-haeyo.md": { errors: ["haeyo"] },
  "2026-12-06-bad-connectors.md": { errors: ["connector-openers"] },
  "2026-12-06-bad-clustered.md": {
    errors: ["pronoun", "not-but", "empty-wrapup", "translationese", "rhetorical-question", "fake-friendly", "closing-formula"],
  },
  // 걸러낼 말이 기준(3번)보다 적고, 체급·무게·온도·"아니라"를 글자 그대로 쓴 글: 경고만 나오고 통과해야 한다
  "2026-12-08-warn-only.md": {
    pass: true,
    warnings: ["abstract-word", "source-caution-host", "en-dash", "topic-gambling-mention", "short-stack"],
    notErrors: ["abstract-word", "not-but"],
    minNotes: 4,
  },
  // 열리지 않는 근거 주소는 경고만
  "2026-12-09-unreachable-sources.md": { pass: true, warnings: ["source-unreachable"], online: true },
};

function rules(findings: FileReport["errors"]): Set<string> {
  return new Set(findings.map((f) => f.rule));
}

async function main() {
  let failed = 0;
  for (const [name, expect] of Object.entries(CASES)) {
    const [report] = await checkFiles([join(DIR, name)], { offline: !expect.online, articlesDir: RECENT });
    const errors = rules(report.errors);
    const warnings = rules(report.warnings);
    const problems: string[] = [];
    for (const rule of expect.errors ?? []) if (!errors.has(rule)) problems.push(`오류 ${rule} 가 안 나옴`);
    for (const rule of expect.warnings ?? []) if (!warnings.has(rule)) problems.push(`경고 ${rule} 가 안 나옴`);
    for (const rule of expect.notErrors ?? []) if (errors.has(rule)) problems.push(`오류 ${rule} 가 나오면 안 됨`);
    if (expect.pass && report.errors.length) problems.push(`통과해야 하는데 오류: ${[...errors].join(", ")}`);
    if (expect.clean && report.warnings.length) problems.push(`경고가 없어야 하는데: ${[...warnings].join(", ")}`);
    if (expect.minNotes && report.notes.length < expect.minNotes) problems.push(`참고가 ${expect.minNotes}개 이상이어야 하는데 ${report.notes.length}개`);
    if (problems.length) {
      failed++;
      console.log(`어긋남 ${name}\n  ${problems.join("\n  ")}`);
    } else {
      console.log(`맞음   ${name}  (오류: ${[...errors].join(", ") || "없음"} / 경고: ${[...warnings].join(", ") || "없음"})`);
    }
  }

  // 종료 코드: 깨끗한 글은 0, 오류가 있는 글은 1, 경고만 있는 글은 0
  const exitCases: [string, number][] = [
    ["2026-12-05-ufc-1-royce-gracie.md", 0],
    ["2026-12-06-bad-dash.md", 1],
    ["2026-12-08-warn-only.md", 0],
  ];
  for (const [name, code] of exitCases) {
    const run = spawnSync(
      process.execPath,
      ["--import", "tsx", join("scripts", "magazine", "check.ts"), join(DIR, name), "--offline", "--articles-dir", RECENT],
      { encoding: "utf-8" },
    );
    if (run.status !== code) {
      failed++;
      console.log(`어긋남 종료 코드 ${name}: ${run.status} (기대 ${code})\n${run.stderr}`);
    } else {
      console.log(`맞음   종료 코드 ${name} = ${code}`);
    }
  }

  console.log(failed ? `\n자기 시험 실패 ${failed}건` : `\n자기 시험 통과 (${Object.keys(CASES).length + exitCases.length}건)`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
