/**
 * 순위 집계 규칙 자기 시험(요청 없음, 키 없음).
 *
 *   npm run trends:selftest
 *
 * 보는 것: 별명 합치기(규칙, 모델 응답 걸러 내기), 조각 키워드 걸러 내기, 보조 수집본 메우기,
 *         에펨코리아 검색어 순위 읽기(fixtures/fmkorea-best.html)와 점수 반영.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FmSearchItem } from "../../lib/trends";
import { applyFeed, writeFeed } from "./feed";
import {
  isFragmentKey,
  preparePosts,
  scoreKeywords,
  searchStrength,
  SEARCH_ONLY_FACTOR,
  SEARCH_WEIGHT,
  tagHeuristic,
  type Post,
} from "./keywords";
import { acceptGroupsOf, mergeSameEntities, nicknameMergesOf } from "./merge";
import { SOURCES } from "./sources";
import { fmkorea, parseFmSearchRanking } from "./sources/fmkorea";
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
    const posts = postsOf(["GTA6 트레일러", "GTA6 출시일"]);
    // 모델이 띄어 쓴 키워드를 붙였을 때를 흉내 낸다
    posts[0].keywords.set("gta 6", "GTA 6");
    posts[0].keywords.delete("gta6");
    const map = nicknameMergesOf(posts);
    check("띄어쓰기만 다르면 붙여 쓴 쪽으로", map.get("gta 6") === "gta6", show(map));
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
      "페이커센세 강의", "페이커센세 명장면",
      "신현송 한국은행 총재 발언", "한국은행 금리 동결", "신현송 기자회견",
      "어벤져스 둠스데이 예고편", "어벤져스 둠스데이 캐스팅",
      "김민석 총리 일정", "김민석 발언", "김민재 선발", "김민재 평점",
      "블루아카이브 블루아카콜라보 일정", "블루아카이브 블루아카콜라보 굿즈 목록",
      "제노블레이드크로스 리마스터 발표", "제노블레이드크로스 발매일", "제노블레이드 스토리 요약", "제노블레이드 공략",
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
    const known = acceptGroupsOf(posts, [{ canonical: "페이커센세", members: ["페이커센세", "페이커"] }]);
    check("사전 이름이 묶음에 있으면 그쪽이 정식 이름", known.get("페이커센세") === "페이커" && !known.has("페이커"), show(known));
    check("글자가 안 겹치면 버림(사람과 기관)", acceptGroupsOf(posts, [{ canonical: "한국은행", members: ["한국은행", "신현송"] }]).size === 0);
    check("글자가 안 겹치면 버림(작품과 부제)", acceptGroupsOf(posts, [{ canonical: "어벤져스", members: ["어벤져스", "둠스데이"] }]).size === 0);
    check("성 붙은 이름 둘은 다른 사람", acceptGroupsOf(posts, [{ canonical: "김민석", members: ["김민석", "김민재"] }]).size === 0);
    check("같은 제목에 함께 나오는 둘은 버림", acceptGroupsOf(posts, [{ canonical: "블루아카이브", members: ["블루아카이브", "블루아카콜라보"] }]).size === 0);
    const variant = acceptGroupsOf(posts, [{ canonical: "제노블레이드크로스", members: ["제노블레이드크로스", "제노블레이드"] }]);
    check("글자가 겹치고 따로 나오는 줄임말은 받음", variant.get("제노블레이드") === "제노블레이드크로스", show(variant));
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
  console.log("\n[에펨코리아 검색어 순위: 읽기]");
  {
    const html = readFileSync(join(__dirname, "fixtures", "fmkorea-best.html"), "utf-8");
    const items = parseFmSearchRanking(html);
    const at = (rank: number) => items.find((i) => i.rank === rank);
    check("10줄, 목록·티커 중복 없이", items.length === 10 && new Set(items.map((i) => i.keyword)).size === 10, items.map((i) => i.keyword).join(" "));
    check("순위·검색어 그대로", at(1)?.keyword === "페이커" && at(2)?.keyword === "gta" && items.every((i, n) => i.rank === n + 1));
    check("변화 표시: 없음 0, +1, -3, new", at(1)?.change === 0 && at(4)?.change === 1 && at(3)?.change === -3 && at(5)?.change === "new" && at(10)?.change === -1);
    check("HTML 엔티티를 풀어 읽음(R&D)", at(8)?.keyword === "R&D", at(8)?.keyword);
    const tickerOnly = html.replace(/<ul class="keyword_rank_list">[\s\S]*?<\/ul>/, "");
    const fromTicker = parseFmSearchRanking(tickerOnly);
    check("목록이 없으면 티커에서", fromTicker.length === 10 && fromTicker[2].change === -3);
    check("위젯이 없으면 빈 목록", parseFmSearchRanking("<html><body><ul><li class='li'></li></ul></body></html>").length === 0);
    const posts = fmkorea.parse(html, "https://www.fmkorea.com/best");
    check(
      "글 줄은 그대로 읽음(핫딜 skip, 정치 표시)",
      posts.length === 3 && posts[0].title === "GTA6 트레일러 3편 공개" && posts[1].skip === true && posts[2].politicsFlag === true,
      posts.map((p) => p.title).join(" / "),
    );
    check("검색어 위젯은 글 줄로 안 들어감", !posts.some((p) => /페이커|토트넘/.test(p.title)));
  }

  // -------------------------------------------------------------------------
  console.log("\n[에펨코리아 검색어 순위: 점수]");
  {
    const s = (rank: number, keyword: string, change: FmSearchItem["change"] = 0): FmSearchItem => ({ rank, keyword, change });
    check("세기: 1위 1.0, 10위 0.37", Math.abs(searchStrength(s(1, "a")) - 1) < 1e-9 && Math.abs(searchStrength(s(10, "a")) - 0.37) < 1e-9);
    check("new 는 두 칸 위까지만 넘음(3위 new < 1위)", searchStrength(s(3, "a", "new")) < searchStrength(s(1, "a")) && searchStrength(s(3, "a", "new")) > searchStrength(s(2, "a")));
    check("new·오름은 더, 내림은 덜", searchStrength(s(5, "a", "new")) > searchStrength(s(5, "a", 2)) && searchStrength(s(5, "a", 2)) > searchStrength(s(5, "a")) && searchStrength(s(5, "a")) > searchStrength(s(5, "a", -3)));
    check("오름은 3칸까지만", searchStrength(s(5, "a", 9)) === searchStrength(s(5, "a", 3)));

    const titles = [
      "dcinside|GTA6 트레일러 공개", "ruliweb|GTA6 발매일 확정", "fmkorea|GTA6 가격 정리", "dcinside|GTA6 지도 분석", "ruliweb|GTA6 예약 구매",
      "dcinside|김준표 유튜브 복귀", "dcinside|김준표 방송 다시보기", "dcinside|김준표 사과문",
      "fmkorea|존박 신곡 무대",
      "inven|이동 경로 정리", "inven|이동 수단 비교", "inven|이동 시간 단축",
      "dcinside|윤석열 재판 결과", "ruliweb|윤석열 선고 일정",
    ];
    const base = scoreKeywords(postsOf(titles));
    check("검색어 없이는 여러 곳에 나온 GTA6가 1위", base[0]?.key === "gta6", base.slice(0, 3).map((k) => k.keyword).join(" "));
    check("검색어 없이는 한 곳 한 글(존박)은 순위 밖", !base.some((k) => k.key === "존박"));

    const search = [s(1, "준표"), s(2, "gta", 1), s(3, "존박", "new"), s(4, "투컷", -3), s(5, "윤석열", 2), s(6, "근황"), s(7, "이동연"), s(8, "투컷")];
    const scored = scoreKeywords(postsOf(titles), 50, search);
    const get = (key: string) => scored.find((k) => k.key === key);
    const order = scored.map((k) => k.key);
    const line = scored.slice(0, 6).map((k) => `${k.keyword}:${k.raw.toFixed(1)}`).join(" ");
    check("검색어 1위 '준표' → 김준표에 붙음", get("김준표")?.search[0]?.keyword === "준표" && !get("준표"), line);
    check("검색어도 있고 글도 가장 많은 GTA6 가 1위, 그다음 검색어 1위 김준표", order[0] === "gta6" && order[1] === "김준표", line);
    check(
      "검색어에 오른 말(글 있는 것)은 검색어 없는 말보다 위",
      scored.filter((k) => k.search.length && k.mentions > 0 && !k.sensitive).every((k) => scored.filter((x) => !x.search.length).every((x) => x.raw < k.raw)),
      line,
    );
    check("'gta' → GTA6 에 붙음(새 줄 없음)", get("gta6")?.search[0]?.keyword === "gta" && !get("gta"));
    check("글 하나뿐인 존박도 검색어라 후보로, 그 글을 묶음", get("존박")?.mentions === 1 && get("존박")?.samples.length === 1);
    const tukeot = get("투컷");
    check("제목에 없는 검색어(투컷)도 후보로, 글 0", tukeot?.mentions === 0 && tukeot.sources.length === 0 && tukeot.samples.length === 0);
    check("같은 검색어가 두 번이면 센 쪽(4위)만 셈", tukeot?.search.length === 2 && tukeot.search[0].rank === 4);
    check("글 없는 검색어는 덜 쳐 줌(SEARCH_ONLY_FACTOR)", Boolean(tukeot) && Boolean(get("존박")) && tukeot!.raw < get("존박")!.raw);
    const ref = base.find((k) => k.sources.length > 1)!.raw;
    check(
      "글 없는 검색어 점수 = 글 근거 1등 × SEARCH_WEIGHT × 세기 × SEARCH_ONLY_FACTOR",
      Math.abs((tukeot?.raw ?? 0) - ref * SEARCH_WEIGHT * searchStrength(s(4, "투컷", -3)) * SEARCH_ONLY_FACTOR) < 1e-6,
    );
    check("정치 검색어는 민감(기본 차트에서 빠짐)", get("윤석열")?.sensitive === true && get("윤석열")?.samples.length === 0);
    check("불용어 검색어(근황)는 안 씀", !scored.some((k) => k.search.some((h) => h.keyword === "근황")));
    check("검색어가 더 길면 사전 이름에만 붙음(이동연 → '이동' 아님)", !get("이동")?.search.length && get("이동연")?.mentions === 0);
    check("검색어 없는 키워드는 search 가 빈 배열", scored.filter((k) => !k.search.length).every((k) => Array.isArray(k.search)));
    {
      // 넓은 말(나라 이름)은 검색어 가산점도 덜 받는다
      const weak = scoreKeywords(postsOf([...titles, "clien|일본 여행 후기", "dogdrip|일본 물가 근황"]), 50, [s(1, "일본"), s(2, "존박")]);
      const japan = weak.find((k) => k.key === "일본");
      const john = weak.find((k) => k.key === "존박");
      check("넓은 말(일본)은 검색어 1위여도 2위 존박보다 덜 받음", Boolean(japan && john) && japan!.raw < john!.raw, weak.slice(0, 4).map((k) => `${k.keyword}:${k.raw.toFixed(1)}`).join(" "));
    }
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

      // 검색어 순위도 수집본으로 넘어온다
      {
        const ranking = { collectedAt: new Date(now - 5 * 60_000).toISOString(), items: [{ rank: 1, keyword: "페이커", change: "new" as const }] };
        const local = fresh().map((x) => (x.adapter.id === "fmkorea" ? { ...x, ok: true, error: undefined, posts: feed.sources[0].posts, searchRanking: ranking } : x));
        const withSearch = join(dir, "with-search.json");
        writeFeed(withSearch, local, new Date(now));
        r = fresh();
        applyFeed(r, withSearch, now + 30 * 60_000);
        check("수집본의 검색어 순위로 메움", get(r, "fmkorea").searchRanking?.items[0]?.keyword === "페이커");
        r = fresh();
        applyFeed(r, path, now);
        check("검색어 순위가 없는 예전 수집본도 그대로 씀", get(r, "fmkorea").ok && !get(r, "fmkorea").searchRanking);
        const stale = JSON.parse(readFileSync(withSearch, "utf-8"));
        stale.sources[0].searchRanking.collectedAt = new Date(now - 400 * 60_000).toISOString();
        writeFileSync(join(dir, "stale-search.json"), JSON.stringify(stale));
        r = fresh();
        applyFeed(r, join(dir, "stale-search.json"), now);
        check("수집본은 새것이어도 검색어 순위가 오래됐으면 버림", get(r, "fmkorea").ok && !get(r, "fmkorea").searchRanking);
        const odd = JSON.parse(readFileSync(withSearch, "utf-8"));
        odd.sources[0].searchRanking.items[0].keyword = "x".repeat(80);
        writeFileSync(join(dir, "odd-search.json"), JSON.stringify(odd));
        r = fresh();
        applyFeed(r, join(dir, "odd-search.json"), now);
        check("검색어 모양이 틀리면 수집본을 통째로 쓰지 않음", failedCount(r) === 2);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log(failed ? `\n자기 시험 실패 ${failed}/${total}건` : `\n자기 시험 통과 (${total}건)`);
  process.exit(failed ? 1 : 0);
}

main();
