import type { Article } from "@/lib/articles";
import { ARTICLE_COLOR } from "@/lib/category-style";

/**
 * 글 표지.
 * 이용 허락이 확인된 사진이 있으면 사진을, 없으면 분류 색과 큰 글자로 만든 표지를 쓴다.
 * 사진 없는 글이 빈 상자로 보이지 않게 하려는 장치다.
 */
export function ArticleCover({
  article,
  size = "card",
  priority = false,
}: {
  article: Article;
  size?: "lead" | "card" | "page";
  priority?: boolean;
}) {
  const color = ARTICLE_COLOR[article.category];
  const image = article.image;

  if (image) {
    return (
      <figure className={`cover cover-${size} cover-photo`}>
        {/* 위키미디어 원본을 그대로 쓴다. 버셀 이미지 변환을 거치면 방문자가 늘 때 요금이 붙는다. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={image.alt}
          width={image.width}
          height={image.height}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : undefined}
          referrerPolicy="no-referrer"
        />
        {size === "page" && (
          <figcaption>
            <a href={image.sourceUrl} target="_blank" rel="noopener noreferrer">
              {image.credit}
            </a>
            <span>{image.license}</span>
          </figcaption>
        )}
        {/* 카드는 통째로 글 링크라서 그 안에 링크를 또 넣을 수 없다. 출처는 글자로만 찍는다. */}
        {size === "lead" && (
          <figcaption>
            <span>{image.credit}</span>
            <span>{image.license}</span>
          </figcaption>
        )}
      </figure>
    );
  }

  return (
    <div
      className={`cover cover-${size} cover-type`}
      style={{ "--cover": color } as React.CSSProperties}
      aria-hidden
    >
      <span className="cover-angle" />
      <span className="cover-word">{article.category}</span>
      <span className="cover-tag">{article.kicker ?? article.category}</span>
    </div>
  );
}
