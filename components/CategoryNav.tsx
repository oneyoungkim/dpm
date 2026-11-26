import Link from "next/link";
import { ARTICLE_CATEGORIES, loadArticles, type ArticleCategory } from "@/lib/articles";
import { ARTICLE_CATEGORY_SLUG, ARTICLE_COLOR } from "@/lib/category-style";

/** 글이 실제로 있는 분류만 보여 준다. 분류가 하나뿐이면 메뉴를 그리지 않는다. */
export function CategoryNav({ current }: { current?: ArticleCategory }) {
  const present = new Set(loadArticles().map((article) => article.category));
  const categories = ARTICLE_CATEGORIES.filter((category) => present.has(category));
  if (categories.length < 2) return null;
  return (
    <nav className="mag-cats no-scrollbar" aria-label="매거진 분류">
      <Link href="/magazine" className={current ? "mag-cat" : "mag-cat mag-cat-active"}>
        전체
      </Link>
      {categories.map((category) => (
        <Link
          key={category}
          href={`/magazine/c/${ARTICLE_CATEGORY_SLUG[category]}`}
          className={current === category ? "mag-cat mag-cat-active" : "mag-cat"}
        >
          <i style={{ background: ARTICLE_COLOR[category] }} aria-hidden />
          {category}
        </Link>
      ))}
    </nav>
  );
}
