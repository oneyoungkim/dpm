import * as cheerio from "cheerio";
import type { RawPost, SourceAdapter } from "../types";
import { clean, toNumber } from "./util";

/**
 * 인벤 오늘의 핫벤(hot.inven.co.kr).
 * robots.txt: hot.inven.co.kr 는 robots.txt 자리에 오류 페이지를 준다(규칙 없음 → 허용).
 * 한 쪽에 순위 목록이 다 나오므로 첫 쪽만 읽는다.
 */
export const inven: SourceAdapter = {
  id: "inven",
  name: "인벤",
  listUrl: "https://hot.inven.co.kr/",
  pages: ["https://hot.inven.co.kr/"],
  parse(html) {
    const $ = cheerio.load(html);
    const posts: RawPost[] = [];
    $("#hotven-list .list-common.con").each((_, el) => {
      const row = $(el);
      const link = row.find(".title a").first();
      const name = link.find(".name").clone();
      const board = clean(name.find(".cate").text());
      name.find(".num, .cate").remove();
      const title = clean(name.text());
      const href = link.attr("href") ?? "";
      if (!title || !/^https?:\/\//.test(href)) return;
      posts.push({
        source: "inven",
        title,
        url: href,
        board,
        views: toNumber(row.find(".hits").text()),
        likes: toNumber(row.find(".reco").text()),
        comments: toNumber(link.find(".comment").text()),
      });
    });
    return posts;
  },
};
