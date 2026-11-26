/**
 * 순위 집계 규칙 자기 시험(요청 없음, 키 없음).
 *
 *   npm run trends:selftest
 *
 * 보는 것: 별명 합치기(규칙, 모델 응답 걸러 내기), 조각 키워드 걸러 내기, 보조 수집본 메우기.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyFeed } from "./feed";
import { isFragmentKey, preparePosts, scoreKeywords, tagHeuristic, type Post } from "./keywords";
import { acceptGroupsOf, mergeSameEntities, nicknameMergesOf } from "./merge";
import { SOURCES } from "./sources";
import type { RawPost, SourceResult } from "./types";

let failed = 0;
let total = 0;
function check(name: string, ok: boolean, detail = "") {
  total++;
  if (!ok) failed++;
  console.log(`${ok ? "맞음" : "틀림"}  ${name}${detail ? `  (${detail})` : ""}`);
}

let serial = 0;
/** 제목들로 시험용 글을 만든다. "소스|제목" 꼴이면 그 소스로, 아니면 디시로. */
function postsOf(titles: string[]): Post[] {
  const raw: RawPost[] = titles.map((line) => {
    const [source, title] = line.includes("|") ? line.split("|") : ["dcinside", line];
    return { source, title, url: `https://example.com/${serial++}`, board: "", views: 100, likes: 10, comments: 5 };
  });
  const posts = preparePosts(raw);
  tagHeuristic(posts);
  return posts;
}
const show = (map: Map<string, string>) => [...map.entries()].map(([a, b]) => `${a}→${b}`).join(", ") || "없음";

async function main() {
  // -------------------------------------------------------------------------
  console.log("\n[별명 합치기: 규칙]");
  {
    const posts = postsOf(["김준표 사건 총정리", "ruliweb|김준표 유튜브 근황", "준표햄 최근 영상", "ruliweb|준표햄 이슈 정리"]);
    const map = nicknameMergesOf(posts);
    check("이름+햄 → 성 붙은 이름", map.get("준표햄") === "김준표", show(map));
    await mergeSameEntities(posts);
    const scored = scoreKeywords(posts);
    const hit = scored.find((k) => k.key === "김준표");
    check("합친 뒤 한 줄로 4건", hit?.mentions === 4 && !scored.some((k) => k.key === "준표햄"), scored.map((k) => `${k.keyword}:${k.mentions}`).join(" "));
  }
  {
    const map = nicknameMergesOf(postsOf(["김민재 이적설", "이민재 데뷔전", "민재형 오늘 경기", "민재형 인터뷰"]));
    check("성 붙은 이름이 둘이면 합치지 않음", map.size === 0, show(map));
  }
  {
    const map = nicknameMergesOf(postsOf(["김대표 발표 내용", "김대표 해명", "대표님 한마디", "대표님 등장"]));
    check("직함(대표님)은 사람 이름으로 보지 않음", map.size === 0, show(map));
  }
  {
    const map = nicknameMergesOf(postsOf(["페이커 우승 소감", "페이커형님 폼 미쳤다", "페이커갓 캐리"]));
    // "페이커형님"은 낱말을 자를 때 '님'이 떨어져 "페이커형"으로 들어온다
    check("사전 이름+호칭 → 사전 이름", map.get("페이커형") === "페이커" && map.get("페이커갓") === "페이커", show(map));
  }
  {
    const map = nicknameMergesOf(postsOf(["혈액형 성격설", "혈액형 검사", "혈액 부족 사태", "혈액 수급 비상"]));
    check("'형'은 사람 이름 뒤에서만(혈액형 그대로)", map.size === 0, show(map));
  }
  {
    const map = nicknameMergesOf(postsOf(["손흥민 멀티골", "흥민이형 오늘 미쳤다", "손흥민씨 인터뷰"]));
    check("이름+이형, 성명+씨", map.get("흥민이형") === "손흥민" && map.get("손흥민씨") === "손흥민", show(map));
  }
  {
    const map = nicknameMergesOf(postsOf(["유재석 새 예능", "재석형 미담", "이재형 신곡 발표", "이재형 콘서트"]));
    check("이름이 '형'으로 끝나는 사람은 그대로", map.get("재석형") === "유재석" && !map.has("이재형"), show(map));
  }

  // -------------------------------------------------------------------------
  console.log("\n[별명 합치기: 모델 응답 걸러 내기]");
  {
    const posts = postsOf([
      "김준표 사건 총정리", "김준표 유튜브 근황", "준표햄 최근 영상", "준표햄 이슈 정리",
      "T1 결승 진출", "T1 로스터", "페이커 인터뷰", "페이커 솔랭",
      "일본 여행 후기", "일본 물가", "도쿄 맛집 지도", "도쿄 숙소",
      "GTA6 트레일러", "GTA6 출시일", "쏘나타 신형", "쏘나타 디자인",
    ]);
    const ok = acceptGroupsOf(posts, [{ canonical: "김준표", members: ["김준표", "준표햄"] }]);
    check("목록에 있는 별명 묶음은 받음", ok.get("준표햄") === "김준표", show(ok));
    const reversed = acceptGroupsOf(posts, [{ canonical: "준표햄", members: ["김준표", "준표햄"] }]);
    check("정식 이름은 모델이 고른 대로", reversed.get("김준표") === "준표햄", show(reversed));
    check("목록에 없는 말이 낀 묶음은 남은 것이 둘 미만이면 버림", acceptGroupsOf(posts, [{ canonical: "김준표", members: ["김준표", "없는말"] }]).size === 0);
    check("정식 이름이 묶음 밖이면 버림", acceptGroupsOf(posts, [{ canonical: "쏘나타", members: ["김준표", "준표햄"] }]).size === 0);
    check("사전이 다른 대상으로 아는 둘(T1·페이커)은 버림", acceptGroupsOf(posts, [{ canonical: "T1", members: ["T1", "페이커"] }]).size === 0);
    check("넓은 말(일본)이 낀 묶음은 버림", acceptGroupsOf(posts, [{ canonical: "일본", members: ["일본", "도쿄"] }]).size === 0);
    check("다섯 개 넘게 묶으면 버림", acceptGroupsOf(posts, [{ canonical: "김준표", members: ["김준표", "준표햄", "쏘나타", "도쿄", "GTA6"] }]).size === 0);
    const known = acceptGroupsOf(posts, [{ canonical: "준표햄", members: ["준표햄", "페이커"] }]);
    check("사전 이름이 묶음에 있으면 그쪽이 정식 이름", known.get("준표햄") === "페이커" && !known.has("페이커"), show(known));
    const twice = acceptGroupsOf(posts, [
      { canonical: "김준표", members: ["김준표", "준표햄"] },
      { canonical: "쏘나타", members: ["쏘나타", "준표햄"] },
    ]);
    check("한 키워드는 한 묶음에만", twice.size === 1 && twice.get("준표햄") === "김준표", show(twice));
  }

  // -------------------------------------------------------------------------
  console.log("\n[조각 키워드]");
  check("DR, 한 커뮤니티 → 조각", isFragmentKey("dr", 1));
  check("DR, 두 커뮤니티 → 인정", !isFragmentKey("dr", 2));
  check("AI·T1·KT 는 사전 이름", !isFragmentKey("ai", 1) && !isFragmentKey("t1", 1) && !isFragmentKey("kt", 1));
  check("숫자로 시작(3끼, 2026) → 조각", isFragmentKey("3끼", 3) && isFragmentKey("2026", 2));
  check("한글 한 글자 → 조각", isFragmentKey("김", 3));
  check("GTA6·FM27·둠스데이·두 낱말은 그대로", !isFragmentKey("gta6", 1) && !isFragmentKey("fm27", 1) && !isFragmentKey("둠스데이", 1) && !isFragmentKey("코카콜라 제로", 1));
  {
    const posts = postsOf(["inven|신규시즌 DR시즌 미페", "inven|DR 신규특성 정리", "inven|DR 시즌 일정", "inven|GTA6 발매일", "ruliweb|GTA6 예약 구매"]);
    const scored = scoreKeywords(posts);
    check("순위에 DR 이 안 나옴", !scored.some((k) => k.key === "dr") && scored.some((k) => k.key === "gta6"), scored.map((k) => k.keyword).join(" "));
  }

  // -------------------------------------------------------------------------
  console.log("\n[보조 수집본]");
  {
    const dir = mkdtempSync(join(tmpdir(), "trends-selftest-"));
    try {
      const now = Date.parse("2026-11-26T08:00:00Z");
      const post = (source: string, n: number, host: string): RawPost => ({ source, title: `글 ${n}`, url: `https://${host}/${n}`, board: "", views: null, likes: 1, comments: 1 });
      const feed = {
        generatedAt: new Date(now).toISOString(),
        sources: [
          { id: "fmkorea", ok: true, posts: [post("fmkorea", 1, "www.fmkorea.com"), post("fmkorea", 2, "www.fmkorea.com")] },
          { id: "dogdrip", ok: true, posts: [post("dogdrip", 1, "www.dogdrip.net")] },
        ],
      };
      const path = join(dir, "feed.json");
      writeFileSync(path, JSON.stringify(feed));
      const fresh = (): SourceResult[] =>
        SOURCES.map((adapter) => {
          const blocked = adapter.id === "fmkorea" || adapter.id === "dogdrip";
          return { adapter, ok: !blocked, error: blocked ? "HTTP 430" : undefined, posts: blocked ? [] : [post(adapter.id, 9, new URL(adapter.listUrl).host)] };
        });
      const failedCount = (r: SourceResult[]) => r.filter((x) => !x.ok).length;
      const get = (r: SourceResult[], id: string) => r.find((x) => x.adapter.id === id)!;

      let r = fresh();
      applyFeed(r, path, now + 35 * 60_000);
      check("35분 전 수집본으로 막힌 두 곳을 메움", failedCount(r) === 0 && get(r, "fmkorea").posts.length === 2 && get(r, "dogdrip").posts.length === 1);
      check("직접 읽은 곳은 그대로", get(r, "clien").posts.length === 1 && !get(r, "clien").note);

      r = fresh();
      r[0] = { ...r[0], ok: true, error: undefined, posts: [post("fmkorea", 7, "www.fmkorea.com")] };
      applyFeed(r, path, now);
      check("직접 읽기가 되면 수집본을 쓰지 않음", get(r, "fmkorea").posts.length === 1);

      r = fresh();
      applyFeed(r, path, now + 240 * 60_000);
      check("240분 전 수집본은 버림", failedCount(r) === 2);
      r = fresh();
      applyFeed(r, path, now + 170 * 60_000);
      check("170분 전 수집본은 받음", failedCount(r) === 0);
      r = fresh();
      applyFeed(r, path, now - 60 * 60_000);
      check("앞날 시각이 적힌 수집본은 버림", failedCount(r) === 2);
      r = fresh();
      check("파일이 없으면 그냥 넘어감", applyFeed(r, join(dir, "none.json"), now)[0] === "보조 수집본 없음" && failedCount(r) === 2);

      writeFileSync(join(dir, "broken.json"), "{ not json");
      r = fresh();
      applyFeed(r, join(dir, "broken.json"), now);
      check("깨진 파일은 쓰지 않음", failedCount(r) === 2);

      const evil = structuredClone(feed);
      evil.sources[0].posts = [
        post("fmkorea", 1, "example.com"),
        { ...post("fmkorea", 2, "www.fmkorea.com"), url: "http://www.fmkorea.com/2" },
        post("dcinside", 3, "www.fmkorea.com"),
        post("fmkorea", 4, "www.fmkorea.com"),
      ];
      writeFileSync(join(dir, "evil.json"), JSON.stringify(evil));
      r = fresh();
      applyFeed(r, join(dir, "evil.json"), now);
      check("주소·소스가 안 맞는 글은 걸러 냄", get(r, "fmkorea").posts.length === 1 && get(r, "fmkorea").posts[0].url.endsWith("/4"));

      const half = structuredClone(feed);
      half.sources[1] = { id: "dogdrip", ok: false, posts: [] };
      writeFileSync(join(dir, "half.json"), JSON.stringify(half));
      r = fresh();
      applyFeed(r, join(dir, "half.json"), now);
      check("수집본에서도 실패한 소스는 실패로 남음", get(r, "fmkorea").ok && !get(r, "dogdrip").ok);

      const bad = JSON.parse(JSON.stringify(feed));
      delete bad.sources[0].posts[0].title;
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      r = fresh();
      applyFeed(r, join(dir, "bad.json"), now);
      check("모양이 틀린 수집본은 통째로 쓰지 않음", failedCount(r) === 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log(failed ? `\n자기 시험 실패 ${failed}/${total}건` : `\n자기 시험 통과 (${total}건)`);
  process.exit(failed ? 1 : 0);
}

main();
