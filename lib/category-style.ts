import type { ArticleCategory } from "./articles";
import type { TrendCategory } from "./trends";

/**
 * 분류 → 색. 매거진 표지, 순위 칩, 점이 같은 표를 쓴다.
 * 인라인 style로 넣으므로 Tailwind 클래스가 아니라 색 값을 그대로 둔다.
 */
export const ARTICLE_COLOR: Record<ArticleCategory, string> = {
  격투기: "#ff4d42",
  축구: "#3fd07f",
  야구: "#f1a640",
  농구: "#f58a43",
  게임: "#9d82ff",
  테크: "#6ea8ff",
  자동차: "#49c7d9",
  돈: "#e0b56d",
  몸: "#c7ff16",
  장비: "#c9ced3",
  컬처: "#ef7eb1",
};

export const TREND_COLOR: Record<TrendCategory, string> = {
  축구: "#3fd07f",
  야구: "#f1a640",
  격투기: "#ff4d42",
  농구: "#f58a43",
  게임: "#9d82ff",
  테크: "#6ea8ff",
  자동차: "#49c7d9",
  돈: "#e0b56d",
  연예: "#ef7eb1",
  시사: "#8a9199",
  기타: "#8a9199",
};

/** 매거진 분류의 주소용 영문 이름. /magazine/c/<slug> */
export const ARTICLE_CATEGORY_SLUG: Record<ArticleCategory, string> = {
  격투기: "fight",
  축구: "football",
  야구: "baseball",
  농구: "basketball",
  게임: "game",
  테크: "tech",
  자동차: "car",
  돈: "money",
  몸: "body",
  장비: "gear",
  컬처: "culture",
};

export function articleCategoryFromSlug(slug: string): ArticleCategory | undefined {
  return (Object.keys(ARTICLE_CATEGORY_SLUG) as ArticleCategory[]).find(
    (category) => ARTICLE_CATEGORY_SLUG[category] === slug,
  );
}
