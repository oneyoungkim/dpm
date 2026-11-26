import * as cheerio from "cheerio";
import type { RawPost, SourceAdapter } from "../types";
import { absolute, clean, toNumber } from "./util";

/**
 * 개드립 인기글.
 * robots.txt: User-agent * 는 Crawl-delay 10 과 몇몇 경로(/*listStyle=, /*_filter= …)만 막는다.
 * sort_index=popular 는 검색엔진 묶음에서만 막혀 있고 * 묶음에서는 열려 있다. 요청 간격은 10초를 지킨다.
 */
export const dogdrip: SourceAdapter = {
  id: "dogdrip",
  name: "개드립",
  listUrl: "https://www.dogdrip.net/dogdrip?sort_index=popular",
  pages: [
    "https://www.dogdrip.net/dogdrip?sort_index=popular",
    "https://www.dogdrip.net/dogdrip?sort_index=popular&page=2",
  ],
  parse(html, pageUrl) {
    const $ = cheerio.load(html);
    const posts: RawPost[] = [];
    $("a.title-link").each((_, el) => {
      const link = $(el);
      const srl = link.attr("data-document-srl");
      const title = clean(link.text());
      if (!title || !srl) return;
      const box = link.closest(".ed.width-expand");
      const comments = toNumber(link.closest("h5").find(".text-primary").first().text());
      const likes = toNumber(box.find(".list-meta .fa-thumbs-up").closest("span").next("span").text());
      posts.push({
        source: "dogdrip",
        title,
        url: absolute(`/${srl}`, pageUrl),
        board: "개드립",
        views: null,
        likes,
        comments,
      });
    });
    return posts;
  },
};
