import * as cheerio from "cheerio";
import type { RawPost, SourceAdapter } from "../types";
import { clean, toNumber } from "./util";

/**
 * 에펨코리아 포텐 터짐.
 * robots.txt: User-agent * 는 / 를 막고 /best, /best2, /humor 만 연다.
 * 그래서 2쪽은 /index.php?mid=best&page=2(금지) 대신 /best?page=2 로 읽는다.
 * 글 주소도 /index.php?... 대신 https://www.fmkorea.com/<글번호> 로 바꿔 둔다.
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
};
