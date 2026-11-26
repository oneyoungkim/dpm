import * as cheerio from "cheerio";
import type { RawPost, SourceAdapter } from "../types";
import { absolute, clean, toNumber } from "./util";

/**
 * 보배드림 베스트글.
 * robots.txt: User-agent * Allow: /. Accept 에 *\/* 가 없으면 406 을 준다(fetch.ts 기본 헤더에 들어 있다).
 */
export const bobaedream: SourceAdapter = {
  id: "bobaedream",
  name: "보배드림",
  listUrl: "https://www.bobaedream.co.kr/list?code=best",
  pages: ["https://www.bobaedream.co.kr/list?code=best", "https://www.bobaedream.co.kr/list?code=best&page=2"],
  parse(html, pageUrl) {
    const $ = cheerio.load(html);
    const posts: RawPost[] = [];
    $("tbody tr").each((_, el) => {
      const tr = $(el);
      const link = tr.find("a.bsubject").first();
      const title = clean(link.attr("title") || link.text());
      const href = absolute(link.attr("href"), pageUrl);
      if (!title || !href) return;
      if (tr.find("td.num01, td.notice").length || /notice/.test(tr.attr("class") ?? "")) return;
      const board = clean(tr.find("td.category").attr("title") || tr.find("td.category").text());
      const no = new URL(href).searchParams.get("No");
      posts.push({
        source: "bobaedream",
        title,
        url: no ? `https://www.bobaedream.co.kr/view?code=best&No=${no}` : href,
        board,
        views: toNumber(tr.find("td.count").text()),
        likes: toNumber(tr.find("td.recomm").text()),
        comments: toNumber(tr.find(".totreply").text()),
        politicsFlag: /정치/.test(board),
        adultBoard: /후방/.test(board),
      });
    });
    return posts;
  },
};
