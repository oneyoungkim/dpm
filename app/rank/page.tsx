import type { Metadata } from "next";
import { activeTrendCategories, loadTrends } from "@/lib/trends";
import { RankChart } from "@/components/RankChart";
import { formatTallyTime } from "@/components/RankBoard";
import { RankDelta } from "@/components/RankDelta";
import { AdSlot } from "@/components/AdSlot";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 600;

export const metadata: Metadata = pageMetadata({
  title: "커뮤니티 키워드 순위",
  description:
    "에펨코리아·디시·루리웹 인기 글 제목을 집계해 지금 가장 많이 나오는 말을 순위로 보여 줍니다.",
  path: "/rank",
});

export default function RankPage() {
  const trends = loadTrends();
  const categories = activeTrendCategories(trends);
  const okSources = trends.sources.filter((source) => source.ok);
  const posts = okSources.reduce((sum, source) => sum + source.posts, 0);
  // 순위의 1순위 근거라 작게 같이 보여 준다. 정치·사건사고·욕설 검색어는 싣지 않는다
  const search = trends.fmkoreaSearch;
  const searchItems = search?.items.filter((item) => !item.sensitive) ?? [];

  return (
    <main id="main" className="page">
      <header className="page-head">
        <p className="eyebrow">뜰 각 / 커뮤니티 키워드 순위</p>
        <h1>지금 뜨는 말</h1>
        <p className="page-deck">
          남자 커뮤니티 {okSources.length}곳의 인기 글 {posts.toLocaleString("ko-KR")}개 제목에서 가장 많이 나온 말입니다.
          {searchItems.length > 0 ? " 에펨코리아 검색어 순위에 오른 말은 크게 더 쳐 줍니다. " : " "}
          줄을 누르면 그 말이 나온 대표 글이 열립니다.
        </p>
        <p className="page-stamp">
          <span className="live-dot" aria-hidden />
          {formatTallyTime(trends.generatedAt)} 집계 · 2시간마다 갱신
        </p>
      </header>

      {search && searchItems.length > 0 && (
        <section className="search-rank" aria-labelledby="search-rank-title">
          <p className="rank-note" id="search-rank-title">
            에펨코리아 검색어 순위, 최근 24시간 · {formatTallyTime(search.collectedAt)} 기준
          </p>
          <ol className="method-sources">
            {searchItems.map((item) => (
              <li key={`${item.rank}-${item.keyword}`}>
                <span>{item.rank}</span>
                {item.keyword}
                <RankDelta delta={item.change === "new" ? null : item.change} />
              </li>
            ))}
          </ol>
        </section>
      )}

      {trends.keywords.length === 0 ? (
        <p className="rank-empty">첫 집계를 기다리는 중입니다.</p>
      ) : (
        <RankChart keywords={trends.keywords} sources={trends.sources} categories={categories} />
      )}

      <AdSlot placement="rank-mid" />

      <section className="method" aria-labelledby="method-title">
        <h2 id="method-title">순위는 이렇게 만듭니다</h2>
        <ol>
          <li>
            아래 커뮤니티의 인기 글 목록에서 제목과 조회·추천 수만 읽습니다. 글 본문과 댓글은 가져오지 않습니다.
          </li>
          <li>
            제목에서 사람·팀·작품·제품 이름을 뽑고, 같은 대상을 가리키는 말은 하나로 합칩니다.
          </li>
          <li>
            반응이 큰 글에 나올수록, 여러 커뮤니티에 함께 나올수록 점수가 높습니다. 1위 점수를 100으로 놓고 나머지를 맞춥니다.
          </li>
          <li>
            에펨코리아 검색어 순위(최근 24시간)에 오른 말은 점수를 가장 크게 더합니다. 검색어 순위가 높을수록, 오르거나
            새로 들어왔을수록 더 받고, 아직 인기 글 제목에 없는 검색어도 순위에 올립니다.
          </li>
          <li>순위는 집계 때마다 지금 인기 글 목록과 검색어 순위로 새로 만듭니다. 지난 집계의 화제는 점수에 넘기지 않습니다.</li>
          <li>정치·사건사고 키워드는 기본 순위에서 빼고 ‘시사’ 분류에 이름과 숫자만 둡니다.</li>
        </ol>
        {trends.sources.length > 0 && (
          <ul className="method-sources">
            {trends.sources.map((source) => (
              <li key={source.id} className={source.ok ? undefined : "method-source-off"}>
                <a href={source.url} target="_blank" rel="nofollow noopener noreferrer">
                  {source.name}
                </a>
                <span>{source.ok ? `글 ${source.posts}` : "이번 집계 실패"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
