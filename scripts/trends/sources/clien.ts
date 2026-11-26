import * as cheerio from "cheerio";
import type { RawPost, SourceAdapter } from "../types";
import { absolute, clean, toNumber } from "./util";

/**
 * 클리앙 모두의공원.
 * robots.txt: "Allow:/service/board/" 와 "Disallow: /*?*" 가 같이 있다. 최장 일치 규칙으로는
 * /service/board/park?po=1 도 허용이지만, 물음표 붙은 주소를 막으려는 뜻이 분명하므로 따른다.
 * 추천글 모음(/service/recommend)은 막혀 있다. 그래서 쿼리 없는 첫 쪽 하나만 읽는다.
 * 최신순 목록이라 반응이 거의 없는 글은 뺀다.
 */
export const clien: SourceAdapter = {
  id: "clien",
  name: "클리앙",
  listUrl: "https://www.clien.net/service/board/park",
  pages: ["https://www.clien.net/service/board/park"],
  parse(html, pageUrl) {
    const $ = cheerio.load(html);
    const posts: RawPost[] = [];
    $("div.list_item.symph_row").each((_, el) => {
      const row = $(el);
      if (row.hasClass("notice") || row.hasClass("hongbo")) return;
      const link = row.find("a.list_subject").first();
      const title = clean(link.find(".subject_fixed").attr("title") || link.text());
      const href = absolute(link.attr("href"), pageUrl);
      if (!title || !href) return;
      const likes = toNumber(row.find(".list_symph span").first().text());
      const comments = toNumber(row.attr("data-comment-count")) ?? toNumber(row.find(".list_reply").text());
      const url = href.split("?")[0];
      posts.push({
        source: "clien",
        title,
        url,
        board: "모두의공원",
        views: toNumber(row.find(".list_hit .hit").text()),
        likes,
        comments,
        // 최신순 목록이라 반응 없는 글은 이야깃거리로 치지 않는다
        skip: (likes ?? 0) < 1 && (comments ?? 0) < 5,
      });
    });
    return posts;
  },
};
