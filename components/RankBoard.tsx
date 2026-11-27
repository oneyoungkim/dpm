import Link from "next/link";
import type { CSSProperties } from "react";
import type { TrendKeyword, TrendsFile } from "@/lib/trends";
import { TREND_COLOR } from "@/lib/category-style";
import { RankDelta } from "./RankDelta";

export function formatTallyTime(iso: string): string {
  const time = Date.parse(iso);
  if (!time) return "집계 전";
  return new Date(time).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 첫 화면용 순위판. 눌러서 펼치는 것 없이 한눈에 읽는 용도다. */
export function RankBoard({ file, keywords }: { file: TrendsFile; keywords: TrendKeyword[] }) {
  const okSources = file.sources.filter((source) => source.ok);
  return (
    <section className="rank-board" aria-labelledby="rank-board-title">
      <header className="rank-board-head">
        <div>
          <p className="eyebrow">뜰 각 / 커뮤니티</p>
          <h2 id="rank-board-title">지금 뜨는 말</h2>
        </div>
        <p className="rank-board-meta">
          <span className="live-dot" aria-hidden />
          {formatTallyTime(file.generatedAt)} 집계 · {okSources.length}곳
        </p>
      </header>

      {keywords.length === 0 ? (
        <p className="rank-empty">첫 집계를 기다리는 중입니다.</p>
      ) : (
        <ol className="rank-board-list">
          {keywords.map((item, index) => (
            <li
              key={item.keyword}
              className={item.rank <= 3 ? "rank-row rank-row-top" : "rank-row"}
              // 줄마다 30ms씩 늦게 나타난다(gak.css .rank-board .rank-row)
              style={{ "--row-i": index } as CSSProperties}
            >
              <span className="rank-num">{String(item.rank).padStart(2, "0")}</span>
              <span className="rank-word">
                <strong>{item.keyword}</strong>
                <small style={{ color: TREND_COLOR[item.category] }}>{item.category}</small>
              </span>
              <span className="rank-bar" aria-hidden>
                <i style={{ width: `${Math.max(item.score, 4)}%` }} />
              </span>
              <span className="rank-count">글 {item.mentions}</span>
              <RankDelta delta={item.delta} />
            </li>
          ))}
        </ol>
      )}

      <Link href="/rank" className="rank-board-more">
        전체 순위와 대표 글 보기 <span aria-hidden>→</span>
      </Link>
    </section>
  );
}
