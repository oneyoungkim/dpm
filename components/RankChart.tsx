"use client";

import { useMemo, useState } from "react";
import type { TrendCategory, TrendKeyword, TrendSource } from "@/lib/trends";
import { TREND_COLOR } from "@/lib/category-style";
import { RankDelta } from "./RankDelta";
import { Spark } from "./Spark";

type Tab = "전체" | TrendCategory;

/**
 * 전체 순위표.
 * "전체"에서는 민감 키워드(정치·사건사고 등)를 뺀다. 그런 키워드는 "시사" 탭에서 이름과 숫자만 보여 준다.
 */
export function RankChart({
  keywords,
  sources,
  categories,
}: {
  keywords: TrendKeyword[];
  sources: TrendSource[];
  categories: TrendCategory[];
}) {
  const [tab, setTab] = useState<Tab>("전체");
  const [open, setOpen] = useState<string | null>(null);
  const sourceName = useMemo(() => new Map(sources.map((source) => [source.id, source.name])), [sources]);

  const rows = useMemo(() => {
    const picked =
      tab === "전체" ? keywords.filter((item) => !item.sensitive) : keywords.filter((item) => item.category === tab);
    return picked.map((item, index) => ({ ...item, rank: index + 1 }));
  }, [keywords, tab]);

  const tabs: Tab[] = ["전체", ...categories];

  return (
    <div className="rank-chart">
      <div className="rank-tabs no-scrollbar" role="tablist" aria-label="분류">
        {tabs.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={tab === name ? "rank-tab rank-tab-active" : "rank-tab"}
            onClick={() => {
              setTab(name);
              setOpen(null);
            }}
          >
            {name !== "전체" && <i style={{ background: TREND_COLOR[name] }} aria-hidden />}
            {name}
          </button>
        ))}
      </div>

      {tab === "시사" && (
        <p className="rank-note">
          정치·사건사고 키워드는 이름과 숫자만 싣습니다. 대표 글은 연결하지 않습니다.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rank-empty">이 분류에는 지금 순위에 든 키워드가 없습니다.</p>
      ) : (
        <ol className="rank-table">
          {rows.map((item) => {
            const expanded = open === item.keyword;
            const canExpand = item.samples.length > 0;
            return (
              <li key={item.keyword} className={item.rank <= 3 ? "rank-line rank-line-top" : "rank-line"}>
                <button
                  type="button"
                  className="rank-line-main"
                  aria-expanded={canExpand ? expanded : undefined}
                  aria-label={`${item.rank}위 ${item.keyword}, 글 ${item.mentions}개${canExpand ? ", 대표 글 보기" : ""}`}
                  disabled={!canExpand}
                  onClick={() => setOpen(expanded ? null : item.keyword)}
                >
                  <span className="rank-num">{String(item.rank).padStart(2, "0")}</span>
                  <RankDelta delta={item.delta} />
                  <span className="rank-word">
                    <strong>{item.keyword}</strong>
                    <small style={{ color: TREND_COLOR[item.category] }}>{item.category}</small>
                  </span>
                  <span className="rank-bar" aria-hidden>
                    <i style={{ width: `${Math.max(item.score, 3)}%` }} />
                  </span>
                  <span className="rank-score">{item.score}</span>
                  <span className="rank-count">
                    글 {item.mentions}
                    <small>{item.sources.length}곳</small>
                  </span>
                  <Spark values={item.spark} />
                  <span className="rank-caret" aria-hidden>
                    {canExpand ? (expanded ? "−" : "+") : ""}
                  </span>
                </button>

                {expanded && (
                  <div className="rank-detail">
                    <p className="rank-detail-sources">
                      {item.sources.map((id) => sourceName.get(id) ?? id).join(" · ")}
                      {item.streak > 1 ? ` · ${item.streak}회 연속 순위권` : ""}
                    </p>
                    <ul>
                      {item.samples.map((sample) => (
                        <li key={sample.url}>
                          <a href={sample.url} target="_blank" rel="nofollow noopener noreferrer">
                            <span>{sample.title}</span>
                            <em>{sourceName.get(sample.source) ?? sample.source} ↗</em>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
