/**
 * 커뮤니티 키워드 순위 집계.
 *
 *   npm run trends        → data/trends.json, data/trends-history.json 갱신
 *   npm run trends:dry    → 저장 없이 결과만 출력
 *
 * 개발용 옵션(사이트를 다시 두드리지 않고 사전만 고쳐 볼 때):
 *   --raw-out <파일>  받은 글 목록을 JSON 으로 저장
 *   --raw-in <파일>   저장해 둔 글 목록으로 집계(요청 없음, --dry 와 같이 쓴다)
 *
 * 보조 수집(scripts/trends/feed.ts, 깃허브 서버를 막는 곳을 다른 컴퓨터가 대신 읽을 때):
 *   --only <id,id>    그 소스만 읽는다
 *   --feed-out <파일> 읽은 글 목록을 보조 수집본으로 저장하고 끝낸다(집계·저장 없음). 하나도 못 읽으면 종료 코드 2
 *   --feed-in <파일>  직접 읽기에 실패한 소스를 보조 수집본으로 메운다
 *
 * 순서: 소스별 목록 수집(robots.txt 확인, 곳당 최대 2쪽, 요청 사이 1.5초 이상)
 *   → 글 정리·반응 무게 → (키가 있으면) 모델 태그 → 키 없이 뽑기로 나머지 채우기
 *   → 같은 대상의 별명 합치기(merge.ts)
 *   → 점수·분류·민감·샘플 → 지난 기록과 비교 → 안전장치 통과 시 저장
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TrendKeyword, TrendsFile, TrendSource } from "../../lib/trends";
import { applyFeed, writeFeed } from "./feed";
import { fetchListPage } from "./fetch";
import { appendRun, loadHistory, trendOf } from "./history";
import { preparePosts, scoreKeywords, tagHeuristic } from "./keywords";
import { tagWithModel } from "./llm";
import { mergeSameEntities } from "./merge";
import { SOURCES } from "./sources";
import type { RawPost, SourceResult } from "./types";

const DATA_DIR = join(process.cwd(), "data");
const TRENDS_PATH = join(DATA_DIR, "trends.json");
const HISTORY_PATH = join(DATA_DIR, "trends-history.json");
const MAX_KEYWORDS = 50;
const MIN_KEYWORDS = 10;

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const argValue = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const RAW_OUT = argValue("--raw-out");
const RAW_IN = argValue("--raw-in");
const FEED_OUT = argValue("--feed-out");
const FEED_IN = argValue("--feed-in");
const ONLY = argValue("--only")
  ?.split(",")
  .map((id) => id.trim())
  .filter(Boolean);
/** 키워드마다 걸린 제목을 다 찍는다(사전 손볼 때) */
const EXPLAIN = args.includes("--explain");

const unknown = (ONLY ?? []).filter((id) => !SOURCES.some((s) => s.id === id));
if (unknown.length) {
  console.error(`--only 에 모르는 소스: ${unknown.join(", ")} (쓸 수 있는 것: ${SOURCES.map((s) => s.id).join(", ")})`);
  process.exit(1);
}
/** 이번 실행에서 읽을 소스 */
const ACTIVE = ONLY ? SOURCES.filter((s) => ONLY.includes(s.id)) : SOURCES;

async function collect(): Promise<SourceResult[]> {
  const results: SourceResult[] = [];
  // 소스끼리는 호스트가 달라 동시에 돌려도 각 사이트에는 1.5초 간격이 지켜진다
  await Promise.all(
    ACTIVE.map(async (adapter) => {
      const posts: RawPost[] = [];
      let error: string | undefined;
      for (const page of adapter.pages.slice(0, 2)) {
        try {
          const html = await fetchListPage(page, adapter.headers);
          const parsed = adapter.parse(html, page);
          if (parsed.length === 0) throw new Error("목록에서 글을 하나도 못 읽음(구조가 바뀌었을 수 있음)");
          posts.push(...parsed);
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
          // 첫 쪽이 실패하면 둘째 쪽도 볼 필요가 없다
          if (posts.length === 0) break;
        }
      }
      results.push({ adapter, posts, ok: posts.length > 0, error: posts.length > 0 ? undefined : error });
    }),
  );
  return ACTIVE.map((s) => results.find((r) => r.adapter.id === s.id)!);
}

function loadRaw(path: string): SourceResult[] {
  const saved = JSON.parse(readFileSync(path, "utf-8")) as Array<{ id: string; ok: boolean; posts: RawPost[] }>;
  return SOURCES.map((adapter) => {
    const hit = saved.find((s) => s.id === adapter.id);
    return { adapter, posts: hit?.posts ?? [], ok: hit?.ok ?? false, error: hit ? undefined : "저장본에 없음" };
  });
}

function warnLoud(lines: string[]) {
  const bar = "!".repeat(60);
  console.warn(`\n${bar}\n${lines.map((l) => `!! ${l}`).join("\n")}\n${bar}\n`);
}

async function main() {
  console.log(`▶ 커뮤니티 키워드 집계 ${DRY ? "(dry)" : ""}`);

  const results = RAW_IN ? loadRaw(RAW_IN) : await collect();
  const feedLines = FEED_IN && !RAW_IN ? applyFeed(results, FEED_IN) : [];
  for (const r of results) {
    const mark = r.ok ? "✓" : "✗";
    const extra = r.error ?? r.note;
    console.log(`  ${mark} ${r.adapter.name.padEnd(8)} ${String(r.posts.length).padStart(3)}건${extra ? `  (${extra})` : ""}`);
  }
  for (const line of feedLines) console.log(`  · ${line}`);
  if (FEED_OUT) {
    const okCount = results.filter((r) => r.ok).length;
    if (okCount === 0) {
      console.warn("  · 읽은 소스가 없어 보조 수집본을 만들지 않음");
      process.exitCode = 2;
      return;
    }
    writeFeed(FEED_OUT, results);
    console.log(`  · 보조 수집본 저장: ${FEED_OUT} (소스 ${okCount}/${results.length})`);
    return;
  }
  if (RAW_OUT) {
    writeFileSync(RAW_OUT, JSON.stringify(results.map((r) => ({ id: r.adapter.id, ok: r.ok, posts: r.posts })), null, 2));
    console.log(`  · 받은 글 목록 저장: ${RAW_OUT}`);
  }

  const posts = preparePosts(results.flatMap((r) => r.posts));
  console.log(`  · 집계에 쓰는 글 ${posts.length}건`);

  const llm = await tagWithModel(posts);
  if (llm.used) console.log(`  · 모델 태그: ${llm.tagged}건에 키워드${llm.error ? `, 일부 실패: ${llm.error}` : ""}`);
  else console.log("  · OPENAI_API_KEY 없음 → 키 없이 뽑기만 씀");
  tagHeuristic(posts);

  // 같은 대상의 별명·줄임말을 한 키워드로(점수를 매기기 전에)
  const merged = await mergeSameEntities(posts);
  for (const m of merged.merges) console.log(`  · 합침(${m.by}): ${m.fromDisplay} → ${m.toDisplay}`);
  if (merged.error) console.warn(`   ! 모델로 합치기 실패(규칙으로 합친 것만 씀): ${merged.error}`);
  else if (merged.merges.length === 0) console.log(`  · 합칠 별명 없음${merged.modelUsed ? "" : "(규칙만 봄)"}`);

  const scored = scoreKeywords(posts, MAX_KEYWORDS);
  const top = scored[0]?.raw ?? 1;
  const history = loadHistory(HISTORY_PATH);

  let mainCount = 0;
  const keywords: TrendKeyword[] = scored.map((k, i) => {
    const rank = i + 1;
    const score = Math.max(1, Math.round((k.raw / top) * 100));
    // 민감 키워드를 뺀 기본 차트에서의 순위
    const mainRank = k.sensitive ? null : ++mainCount;
    return {
      rank,
      keyword: k.keyword,
      category: k.category,
      score,
      mentions: k.mentions,
      sources: k.sources,
      ...trendOf(k.keyword, rank, score, history, mainRank),
      sensitive: k.sensitive,
      samples: k.sensitive ? [] : k.samples,
    };
  });

  const sources: TrendSource[] = results.map((r) => ({
    id: r.adapter.id,
    name: r.adapter.name,
    url: r.adapter.listUrl,
    posts: posts.filter((p) => p.source === r.adapter.id).length,
    ok: r.ok,
  }));
  const file: TrendsFile = { generatedAt: new Date().toISOString(), sources, keywords };

  // 출력: 민감 빼고 상위 20 + 민감 목록
  console.log("\n  순위 (민감 제외 상위 20)");
  for (const k of keywords.filter((k) => !k.sensitive).slice(0, 20)) {
    const d = k.delta === null ? "NEW" : k.delta > 0 ? `▲${k.delta}` : k.delta < 0 ? `▼${-k.delta}` : "-";
    console.log(
      `  ${String(k.rank).padStart(2)}. ${k.keyword.padEnd(14)} ${k.category.padEnd(4)} 점수 ${String(k.score).padStart(3)}  글 ${k.mentions}  [${k.sources.join(",")}]  ${d}`,
    );
  }
  if (EXPLAIN) {
    for (const k of scored) {
      console.log(`\n  ■ ${k.keyword} (${k.category}${k.sensitive ? ", 민감" : ""}) raw ${k.raw.toFixed(2)} [${k.sources.join(",")}]`);
      for (const p of k.posts) console.log(`     - [${p.source}/${p.board}] ${p.title}`);
    }
  }
  const hidden = keywords.filter((k) => k.sensitive).map((k) => k.keyword);
  if (hidden.length) console.log(`\n  민감(기본 차트 제외): ${hidden.join(", ")}`);

  // 안전장치
  const failed = results.filter((r) => !r.ok).length;
  const problems: string[] = [];
  if (failed * 2 >= results.length) problems.push(`소스 ${results.length}곳 중 ${failed}곳 실패`);
  if (keywords.length < MIN_KEYWORDS) problems.push(`키워드가 ${keywords.length}개뿐(최소 ${MIN_KEYWORDS})`);
  if (problems.length) {
    warnLoud([
      "키워드 집계 결과가 부족해 data/trends.json 을 덮어쓰지 않습니다.",
      ...problems,
      existsSync(TRENDS_PATH) ? "기존 파일을 그대로 둡니다." : "기존 파일도 없습니다.",
    ]);
    return;
  }
  if (failed > 0) warnLoud([`소스 ${failed}곳 실패: ${results.filter((r) => !r.ok).map((r) => r.adapter.name).join(", ")}`]);

  if (DRY) {
    console.log("\n  (dry) 저장하지 않음");
    return;
  }
  writeFileSync(TRENDS_PATH, `${JSON.stringify(file, null, 2)}\n`);
  const nextHistory = appendRun(history, {
    generatedAt: file.generatedAt,
    keywords: keywords.map((k) => ({ keyword: k.keyword, rank: k.rank, score: k.score, sensitive: k.sensitive })),
  });
  writeFileSync(HISTORY_PATH, `${JSON.stringify(nextHistory, null, 2)}\n`);
  console.log(`\n  ✓ 저장: data/trends.json (${keywords.length}개), 기록 ${nextHistory.runs.length}회`);
}

main().catch((err) => {
  // 보조 수집은 실패를 알려야 올리지 않는다
  if (FEED_OUT) process.exitCode = 1;
  // 집계가 죽어도 워크플로는 실패로 만들지 않는다(기존 파일 유지)
  warnLoud(["키워드 집계 중 오류 — data/trends.json 은 그대로입니다.", err instanceof Error ? err.stack ?? err.message : String(err)]);
});
