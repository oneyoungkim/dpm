import Link from "next/link";
import type { Article } from "@/lib/articles";
import { ARTICLE_COLOR } from "@/lib/category-style";
import { ArticleCover } from "./ArticleCover";

export function formatArticleDate(iso: string): string {
  const [date] = iso.split("T");
  const [year, month, day] = date.split("-");
  return `${year}.${month}.${day}`;
}

export function ArticleMeta({ article }: { article: Article }) {
  return (
    <p className="article-meta">
      <time dateTime={article.publishedAt}>{formatArticleDate(article.publishedAt)}</time>
      <span>{article.readingMinutes}분</span>
    </p>
  );
}

export function ArticleCard({
  article,
  variant = "card",
  priority = false,
}: {
  article: Article;
  /** lead: 첫 화면 큰 글, card: 격자, row: 사진 없는 한 줄 */
  variant?: "lead" | "card" | "row";
  priority?: boolean;
}) {
  const color = ARTICLE_COLOR[article.category];
  return (
    <article className={`mag-card mag-card-${variant}`}>
      <Link href={`/magazine/${article.slug}`} className="mag-card-link">
        {variant !== "row" && (
          <ArticleCover article={article} size={variant === "lead" ? "lead" : "card"} priority={priority} />
        )}
        <div className="mag-card-text">
          <p className="mag-kicker" style={{ color }}>
            {article.category}
            {article.kicker ? <span>{article.kicker}</span> : null}
          </p>
          <h3>{article.title}</h3>
          {variant !== "row" && <p className="mag-deck">{article.deck}</p>}
          <ArticleMeta article={article} />
        </div>
      </Link>
    </article>
  );
}
