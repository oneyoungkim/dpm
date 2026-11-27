import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SportEvent } from "../../lib/types";
import { checkFiles, type FileReport } from "./check";
import { planMainEvent, type Slot } from "./pick";

/**
 * check.ts 자기 시험.
 *   npx tsx scripts/magazine/selftest.ts
 *
 * fixtures/ 의 시험 글마다 "반드시 나와야 하는 오류·경고"와 "나오면 안 되는 오류"를 적어 두고 맞춰 본다.
 * 최근 글 비교는 fixtures/recent/ 를 쓴다(content/articles 는 건드리지 않는다).
 * 메인 이벤트 고르기(pick.ts 의 planMainEvent)는 만든 일정·글로 맞춰 본다.
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

  // 프리뷰 규칙: 시험 글의 꼬리표·eventIds 만 바꿔 임시 폴더에서 검사한다.
  //   eventIds 가 비면 오류, eventIds 가 있으면 분류 연속·최근 겹침은 오류가 아니고, 이미 소개한 일정이면 오류.
  const read = (name: string) => readFileSync(join(DIR, name), "utf-8");
  const asPreview = (raw: string, ids?: string[]) =>
    raw.replace("kicker: 썰", `kicker: 프리뷰${ids ? `\neventIds:${ids.length ? ids.map((id) => `\n  - ${id}`).join("") : " []"}` : ""}`);
  const tmp = mkdtempSync(join(tmpdir(), "magazine-selftest-"));
  const checkDir = join(tmp, "check");
  // 최근 글 폴더 + 이미 sdb-1 을 소개한 글 하나
  const corpusDir = join(tmp, "corpus");
  mkdirSync(checkDir);
  mkdirSync(corpusDir);
  for (const name of readdirSync(RECENT)) copyFileSync(join(RECENT, name), join(corpusDir, name));
  writeFileSync(
    join(corpusDir, "2026-10-01-earlier-preview.md"),
    asPreview(read("2026-12-05-ufc-1-royce-gracie.md"), ["sdb-1"]).replace("slug: ufc-1-royce-gracie", "slug: earlier-preview"),
  );
  interface PreviewCase {
    label: string;
    name: string;
    raw: string;
    corpus?: string;
    errors?: string[];
    notErrors?: string[];
    warnings?: string[];
    /** 이 규칙 말고 다른 오류는 없어야 한다 */
    onlyErrors?: string[];
  }
  const clean = read("2026-12-05-ufc-1-royce-gracie.md");
  const previewCases: PreviewCase[] = [
    { label: "프리뷰, eventIds 없음", name: "2026-12-05-ufc-1-royce-gracie.md", raw: asPreview(clean), errors: ["preview-event-ids"], onlyErrors: ["preview-event-ids"] },
    { label: "프리뷰, eventIds 빈 칸", name: "2026-12-05-ufc-1-royce-gracie.md", raw: asPreview(clean, []), errors: ["preview-event-ids"], onlyErrors: ["preview-event-ids"] },
    { label: "프리뷰, eventIds 있음", name: "2026-12-05-ufc-1-royce-gracie.md", raw: asPreview(clean, ["sdb-9"]), onlyErrors: [] },
    { label: "썰, eventIds 없음", name: "2026-12-05-ufc-1-royce-gracie.md", raw: clean, onlyErrors: [] },
    {
      label: "프리뷰는 같은 분류 세 편 연속에서 빠짐",
      name: "2026-12-03-bad-category.md",
      raw: asPreview(read("2026-12-03-bad-category.md"), ["sdb-9"]),
      notErrors: ["category-streak"],
    },
    {
      label: "프리뷰는 최근 겹침이 경고로만",
      name: "2026-11-25-bad-recent.md",
      raw: asPreview(read("2026-11-25-bad-recent.md"), ["sdb-9"]),
      notErrors: ["recent-overlap"],
      warnings: ["recent-overlap"],
    },
    {
      label: "이미 소개한 일정을 다시 소개하면 오류",
      name: "2026-12-05-ufc-1-royce-gracie.md",
      raw: asPreview(clean, ["sdb-1"]),
      corpus: corpusDir,
      errors: ["preview-duplicate-event"],
      onlyErrors: ["preview-duplicate-event"],
    },
    {
      label: "다른 일정이면 이미 소개한 글이 있어도 통과",
      name: "2026-12-05-ufc-1-royce-gracie.md",
      raw: asPreview(clean, ["sdb-9"]),
      corpus: corpusDir,
      onlyErrors: [],
    },
  ];
  try {
    for (const c of previewCases) {
      const path = join(checkDir, c.name);
      writeFileSync(path, c.raw);
      const [report] = await checkFiles([path], { offline: true, articlesDir: c.corpus ?? RECENT });
      rmSync(path);
      const errors = rules(report.errors);
      const warnings = rules(report.warnings);
      const problems: string[] = [];
      for (const rule of c.errors ?? []) if (!errors.has(rule)) problems.push(`오류 ${rule} 가 안 나옴`);
      for (const rule of c.notErrors ?? []) if (errors.has(rule)) problems.push(`오류 ${rule} 가 나오면 안 됨`);
      for (const rule of c.warnings ?? []) if (!warnings.has(rule)) problems.push(`경고 ${rule} 가 안 나옴`);
      if (c.onlyErrors) {
        const others = [...errors].filter((r) => !c.onlyErrors!.includes(r));
        if (others.length) problems.push(`다른 오류가 나오면 안 됨: ${others.join(", ")}`);
      }
      if (problems.length) {
        failed++;
        console.log(`어긋남 프리뷰 규칙(${c.label})\n  ${problems.join("\n  ")}`);
      } else {
        console.log(`맞음   프리뷰 규칙(${c.label})  (오류: ${[...errors].join(", ") || "없음"} / 경고: ${[...warnings].join(", ") || "없음"})`);
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const mainCount = mainEventCases();
  failed += mainCount.failed;

  const total = Object.keys(CASES).length + exitCases.length + previewCases.length + mainCount.total;
  console.log(failed ? `\n자기 시험 실패 ${failed}건` : `\n자기 시험 통과 (${total}건)`);
  process.exit(failed ? 1 : 0);
}

// ─── 메인 이벤트 고르기 ─────────────────────────────────

/** 시험용 지금: 2026-12-01 10:00 KST(아침 편) */
const NOW = new Date("2026-12-01T01:00:00Z");
const TODAY = "2026-12-01";

function day(offset: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function ev(id: string, offset: number, hype: number, extra: Partial<SportEvent> = {}): SportEvent {
  const dateKey = day(offset);
  return {
    id,
    sport: "축구",
    category: "축구",
    league: "프리미어리그",
    leagueKey: "epl",
    title: `경기 ${id}`,
    startsAt: `${dateKey}T20:00:00+09:00`,
    dateKey,
    status: "예정",
    hype,
    source: "selftest",
    ...extra,
  } as SportEvent;
}

function art(file: string, publishedAt: string, eventIds: string[] = []) {
  return { file, publishedAt, eventIds };
}

const EVENTS: SportEvent[] = [
  ev("a", 2, 80), // 이번 주 70 이상
  ev("b", 20, 90), // 30일 안 70 이상
  ev("c", 1, 60), // 이번 주 55 이상(문턱 낮춤)
  ev("d", 3, 75), // 이번 주 70 이상
  ev("old", -1, 99), // 지난 일정
  ev("done", 4, 95, { status: "종료" }),
];

interface MainCase {
  name: string;
  events?: SportEvent[];
  articles?: ReturnType<typeof art>[];
  slot?: Slot;
  covers: boolean;
  required: boolean;
  /** 맨 위 일정과 대체 후보 id(순서대로) */
  order?: string[];
  tier?: string;
  /** skipped 에 이 글자가 든 줄이 있어야 한다 */
  skipped?: string[];
}

const MAIN_CASES: MainCase[] = [
  { name: "아침: 차례대로(이번 주 70↑ → 30일 70↑ → 이번 주 55↑)", covers: true, required: true, order: ["a", "d", "b"], tier: "이번 주" },
  {
    name: "이미 소개한 일정은 건너뜀(기간 제한 없이 모든 글)",
    articles: [art("2026-10-01-old.md", "2026-10-01T07:30:00+09:00", ["a"])],
    covers: true,
    required: true,
    order: ["d", "b", "c"],
  },
  {
    name: "이번 주를 다 소개했으면 30일 안으로",
    articles: [art("x.md", "2026-11-20T07:30:00+09:00", ["a", "d"])],
    covers: true,
    required: true,
    order: ["b", "c"],
    tier: "30일 안",
  },
  {
    name: "분류 못 옮김·금지 주제·같은 발표는 거르고 다음 차례로",
    events: [
      ev("money", 1, 99, { category: "돈과 승부", sport: "기타" as SportEvent["sport"] }),
      ev("bet", 1, 98, { title: "토토 배당률 특집" }),
      ev("t1", 2, 90, { title: "토트넘 vs 아스널" }),
      ev("t2", 2, 89, { title: "토트넘 vs 아스널" }),
      ev("e", 3, 85),
    ],
    covers: true,
    required: true,
    order: ["t1", "e"],
    skipped: ["매거진 분류로 옮길 수 없음", "금지 주제", "하나로 합침"],
  },
  {
    name: "이미 소개한 일정과 같은 발표(다른 id)도 건너뜀",
    events: [ev("t1", 2, 90, { title: "토트넘 vs 아스널" }), ev("t2", 2, 89, { title: "토트넘 vs 아스널" }), ev("e", 3, 85)],
    articles: [art("y.md", "2026-11-30T07:30:00+09:00", ["t1"])],
    covers: true,
    required: true,
    order: ["e"],
    skipped: ["이미 소개한 일정과 같은 발표"],
  },
  {
    name: "저녁: 오늘 일정 글이 없으면 메인 이벤트를 대신 맡음",
    slot: "evening",
    articles: [art("2026-12-01-trend.md", "2026-12-01T07:36:00+09:00", [])],
    covers: true,
    required: true,
    order: ["a", "d", "b"],
  },
  {
    name: "저녁: 오늘 일정 글이 있으면 일정 후보를 내지 않음",
    slot: "evening",
    articles: [art("2026-12-01-preview.md", "2026-12-01T07:36:00+09:00", ["a"])],
    covers: false,
    required: false,
    order: [],
  },
  {
    name: "저녁: 어제 일정 글은 오늘 것으로 치지 않음",
    slot: "evening",
    articles: [art("2026-11-30-preview.md", "2026-11-30T18:37:00+09:00", ["a"])],
    covers: true,
    required: true,
    order: ["d", "b", "c"],
  },
  { name: "일정이 없으면 required: false", events: [], covers: true, required: false, order: [] },
  {
    name: "시각이 잡힌 경기가 출시 기간 안내보다 먼저(하이프 70 scheduled > 74 release-window)",
    events: [
      ev("window", 2, 74, { eventMode: "release-window", category: "게임", sport: "기타" as SportEvent["sport"] }),
      ev("match", 3, 70, { eventMode: "scheduled", datePrecision: "time" }),
    ],
    covers: true,
    required: true,
    order: ["match", "window"],
    tier: "이번 주",
  },
  {
    name: "소개할 일정이 다 떨어지면 required: false",
    events: [ev("low", 2, 40)],
    covers: true,
    required: false,
    order: [],
  },
];

function mainEventCases(): { total: number; failed: number } {
  let failed = 0;
  for (const c of MAIN_CASES) {
    const skipped: string[] = [];
    const plan = planMainEvent({ events: c.events ?? EVENTS, articles: c.articles ?? [], now: NOW, slot: c.slot ?? "morning" }, skipped);
    const order = plan.candidates.map((x) => x.eventIds[0]);
    const problems: string[] = [];
    if (plan.covers !== c.covers) problems.push(`covers ${plan.covers} (기대 ${c.covers})`);
    if (plan.mainEvent.required !== c.required) problems.push(`required ${plan.mainEvent.required} (기대 ${c.required})`);
    if (c.order && order.join(",") !== c.order.join(",")) problems.push(`순서 ${order.join(",") || "없음"} (기대 ${c.order.join(",") || "없음"})`);
    if (c.tier && plan.mainEvent.tier !== c.tier) problems.push(`tier ${plan.mainEvent.tier} (기대 ${c.tier})`);
    if (plan.mainEvent.required) {
      if (plan.mainEvent.eventId !== order[0]) problems.push("mainEvent.eventId 가 맨 위 후보와 다름");
      if (plan.mainEvent.alternates.map((a) => a.eventId).join(",") !== order.slice(1).join(",")) problems.push("alternates 가 대체 후보와 다름");
      if (!plan.candidates[0]?.required || plan.candidates.slice(1).some((x) => x.required)) problems.push("required 는 맨 위 후보 하나만");
      if (plan.candidates.some((x) => x.format !== "프리뷰")) problems.push("메인 이벤트 후보 형식은 프리뷰");
    } else if (!plan.mainEvent.reason) problems.push("required: false 인데 이유가 없음");
    for (const text of c.skipped ?? []) if (!skipped.some((line) => line.includes(text))) problems.push(`뺀 것에 "${text}"가 없음`);
    if (problems.length) {
      failed++;
      console.log(`어긋남 메인 이벤트: ${c.name}\n  ${problems.join("\n  ")}`);
    } else {
      console.log(`맞음   메인 이벤트: ${c.name}  (${order.join(" > ") || plan.mainEvent.reason})`);
    }
  }
  return { total: MAIN_CASES.length, failed };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
