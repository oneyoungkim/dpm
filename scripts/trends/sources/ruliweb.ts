import * as cheerio from "cheerio";
import type { RawPost, SourceAdapter } from "../types";
import { absolute, clean, toNumber } from "./util";

/**
 * 루리웹 베스트(전체).
 * robots.txt: /search, /*orderby=, /*range=, /*view_best= 등을 막는다. /best/all?page= 는 열려 있다.
 * 목록에 게시판 이름이 따로 없어 주소의 게시판 번호로 아는 것만 이름을 붙인다.
 */
const BOARD_NAMES: Record<string, string> = {
  "300143": "유머",
  "300148": "정치유머",
};

export const ruliweb: SourceAdapter = {
  id: "ruliweb",
  name: "루리웹",
  listUrl: "https://bbs.ruliweb.com/best/all",
  pages: ["https://bbs.ruliweb.com/best/all", "https://bbs.ruliweb.com/best/all?page=2"],
  parse(html, pageUrl) {
    const $ = cheerio.load(html);
    const posts: RawPost[] = [];
    $("tr.table_body.blocktarget").each((_, el) => {
      const tr = $(el);
      if (tr.hasClass("notice")) return;
      const link = tr.find("a.subject_link").first();
      const clone = link.clone();
      clone.find("span.num_reply, span[style]").remove();
      const title = clean(clone.text());
      const href = absolute(link.attr("href"), pageUrl);
      if (!title || !href) return;
      const boardId = href.match(/board\/(\d+)\/read/)?.[1] ?? "";
      const postId = href.match(/read\/(\d+)/)?.[1];
      const board = BOARD_NAMES[boardId] ?? "";
      posts.push({
        source: "ruliweb",
        title,
        url: postId ? `https://bbs.ruliweb.com/best/board/${boardId}/read/${postId}` : href,
        board,
        views: toNumber(tr.find("td.hit").text()),
        likes: toNumber(tr.find("td.recomd").text()),
        comments: toNumber(link.find(".num_reply").text()),
        politicsFlag: board === "정치유머",
      });
    });
    return posts;
  },
};
