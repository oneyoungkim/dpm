import type { Metadata } from "next";
import { loadArticles } from "@/lib/articles";
import { CategoryNav } from "@/components/CategoryNav";
import { ArticleCard } from "@/components/ArticleCard";
import { AdSlot } from "@/components/AdSlot";
import { JsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbJsonLd, collectionJsonLd } from "@/lib/structured-data";

export const revalidate = 600;

const DESCRIPTION = "격투기, 축구, 차, 장비, 돈. 숫자와 출처가 있는 글을 하루 두 편 올립니다.";

export const metadata: Metadata = pageMetadata({ title: "매거진", description: DESCRIPTION, path: "/magazine" });

export default function MagazinePage() {
  const articles = loadArticles();
  const [lead, ...rest] = articles;

  return (
    <main id="main" className="page">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "매거진", path: "/magazine" },
          ]),
          collectionJsonLd({ name: "매거진", description: DESCRIPTION, path: "/magazine", articles }),
        ]}
      />
      <header className="page-head">
        <p className="eyebrow">읽을 각 / 매거진</p>
        <h1>매거진</h1>
        <p className="page-deck">숫자와 출처가 있는 글을 아침과 저녁에 한 편씩 올립니다.</p>
      </header>

      <CategoryNav />

      {!lead ? (
        <p className="rank-empty">첫 글을 준비하고 있습니다.</p>
      ) : (
        <>
          <ArticleCard article={lead} variant="lead" priority />
          <div className="mag-grid">
            {rest.slice(0, 6).map((article) => (
              <ArticleCard key={article.slug} article={article} />
            ))}
          </div>
          {rest.length > 6 && <AdSlot placement="list-mid" />}
          {rest.length > 6 && (
            <div className="mag-grid">
              {rest.slice(6).map((article) => (
                <ArticleCard key={article.slug} article={article} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
