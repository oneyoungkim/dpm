import * as cheerio from "cheerio";
import type { RawPost, SourceAdapter } from "../types";
import { absolute, clean, toNumber } from "./util";

/**
 * 디시인사이드 실시간 베스트(dcbest).
 * robots.txt: User-agent * 허용, 갤러리 단위 금지 목록에 dcbest 는 없다.
 * 제목 앞 <strong>[싱갤]</strong> 이 원래 갤러리 이름이다.
 */
export const dcinside: SourceAdapter = {
  id: "dcinside",
  name: "디시인사이드",
  listUrl: "https://gall.dcinside.com/board/lists/?id=dcbest",
  pages: [
    "https://gall.dcinside.com/board/lists/?id=dcbest",
    "https://gall.dcinside.com/board/lists/?id=dcbest&page=2",
  ],
  parse(html, pageUrl) {
    const $ = cheerio.load(html);
    const posts: RawPost[] = [];
    $("tr.ub-content.us-post").each((_, el) => {
      const tr = $(el);
      // 공지·설문 등 번호가 숫자가 아닌 줄은 뺀다
      if (!/^\d+$/.test(clean(tr.find("td.gall_num").text()))) return;
      const type = tr.attr("data-type") ?? "";
      if (/notice|survey/.test(type)) return;
      const link = tr.find("td.gall_tit > a").first();
      const strong = clean(link.find("strong").first().text());
      const board = strong.replace(/^\[|\]$/g, "");
      const clone = link.clone();
      clone.find("strong, .thumimg, em").remove();
      const title = clean(clone.text());
      const href = absolute(link.attr("href"), pageUrl);
      if (!title || !href) return;
      const no = new URL(href).searchParams.get("no");
      posts.push({
        source: "dcinside",
        title,
        url: no ? `https://gall.dcinside.com/board/view/?id=dcbest&no=${no}` : href,
        board,
        views: toNumber(tr.find("td.gall_count").text()),
        likes: toNumber(tr.find("td.gall_recommend").text()),
        comments: toNumber(tr.find(".reply_num").first().text()),
        politicsFlag: /정치|정사|국게/.test(board),
      });
    });
    return posts;
  },
};
