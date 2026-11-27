import * as cheerio from "cheerio";
import type { FmSearchItem } from "../../../lib/trends";
import type { RawPost, SourceAdapter } from "../types";
import { clean, toNumber } from "./util";

/** 검색어 순위에서 받는 최대 줄 수(위젯은 10줄) */
const MAX_SEARCH_ITEMS = 20;
/** 이보다 긴 검색어는 버린다(위젯 구조가 바뀌어 엉뚱한 글자가 들어올 때 대비) */
const MAX_SEARCH_KEYWORD_LENGTH = 30;

/**
 * 에펨코리아 검색어 순위.
 * /best 첫 쪽 HTML 에 서버가 그려 넣는다(따로 요청할 주소가 없다).
 *   ul.keyword_rank_list > li.item > a[data-keyword]
 *     span.rank "1." · span.keyword "준표" · (있으면) span.change.up "+1" / .change.down "-3" / .change.new "new"
 * 같은 내용이 ul.keyword_rank_ticker 에도 한 번 더 있다. 목록 쪽을 먼저 읽고, 목록이 없을 때만 티커를 읽는다.
 * 위젯 설명: 최근 24시간 집계, 로그인 사용자 검색만 반영.
 */
export function parseFmSearchRanking(html: string): FmSearchItem[] {
  const $ = cheerio.load(html);
  const read = (selector: string): FmSearchItem[] => {
    const items: FmSearchItem[] = [];
    const seen = new Set<string>();
    $(selector).each((index, el) => {
      const a = $(el).find("a[data-keyword]").first();
      if (!a.length) return;
      const keyword = clean(a.find(".keyword").first().text() || a.attr("data-keyword"));
      if (!keyword || keyword.length > MAX_SEARCH_KEYWORD_LENGTH) return;
      const key = keyword.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const rank = toNumber(a.find(".rank").first().text()) ?? index + 1;
      const mark = a.find(".change").first();
      let change: FmSearchItem["change"] = 0;
      if (mark.length) {
        if (mark.hasClass("new") || /new/i.test(mark.text())) change = "new";
        else {
          const n = Math.abs(toNumber(mark.text()) ?? 0);
          change = mark.hasClass("down") ? -n : n;
        }
      }
      if (rank < 1 || rank > 100) return;
      items.push({ rank, keyword, change });
    });
    return items.sort((x, y) => x.rank - y.rank).slice(0, MAX_SEARCH_ITEMS);
  };
  const list = read("ul.keyword_rank_list > li.item");
  return list.length ? list : read("ul.keyword_rank_ticker > li.item");
}

/**
 * 에펨코리아 포텐 터짐.
 * robots.txt: User-agent * 는 / 를 막고 /best, /best2, /humor 만 연다.
 * 그래서 2쪽은 /index.php?mid=best&page=2(금지) 대신 /best?page=2 로 읽는다.
 * 글 주소도 /index.php?... 대신 https://www.fmkorea.com/<글번호> 로 바꿔 둔다.
 * 첫 쪽에 실린 검색어 순위도 같이 읽는다(parseFmSearchRanking, 요청을 늘리지 않는다).
 */
export const fmkorea: SourceAdapter = {
  id: "fmkorea",
  name: "에펨코리아",
  listUrl: "https://www.fmkorea.com/best",
  pages: ["https://www.fmkorea.com/best", "https://www.fmkorea.com/best?page=2"],
  parse(html) {
    const $ = cheerio.load(html);
    const posts: RawPost[] = [];
    $("li.li").each((_, el) => {
      const li = $(el);
      const cls = li.attr("class") ?? "";
      const link = li.find("h3.title a").first();
      const title = clean(link.find(".ellipsis-target").text() || link.text());
      const href = link.attr("href") ?? "";
      const srl = href.match(/document_srl=(\d+)/)?.[1] ?? href.match(/\/(\d{6,})/)?.[1];
      if (!title || !srl) return;
      const boards = li
        .find(".category a")
        .map((__, a) => clean($(a).text()))
        .get()
        .filter(Boolean);
      posts.push({
        source: "fmkorea",
        title,
        url: `https://www.fmkorea.com/${srl}`,
        board: boards[0] ?? "",
        views: null,
        likes: toNumber(li.find(".pc_voted_count .count").first().text()),
        comments: toNumber(link.find(".comment_count").text()),
        politicsFlag: /li_best2_politics1/.test(cls),
        // 핫딜은 상품 광고라 이야깃거리 집계에서 뺀다
        skip: /li_best2_hotdeal1/.test(cls) || boards.includes("핫딜"),
      });
    });
    return posts;
  },
  parseSearchRanking: parseFmSearchRanking,
};
