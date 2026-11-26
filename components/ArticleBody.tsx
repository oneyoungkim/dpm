import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * 본문 마크다운 → 화면.
 * 원문 HTML과 본문 이미지는 그리지 않는다(글 검사에서도 막지만, 여기서 한 번 더 막는다).
 */
export function ArticleBody({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      disallowedElements={["img", "h1", "script", "iframe"]}
      components={{
        a({ href, children }) {
          const external = typeof href === "string" && /^https?:\/\//.test(href);
          return (
            <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              {children}
            </a>
          );
        },
        table({ children }) {
          return (
            <div className="article-table">
              <table>{children}</table>
            </div>
          );
        },
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}

/** 글 가운데 광고를 넣으려고 본문을 둘째 소제목 앞에서 둘로 가른다. 소제목이 하나뿐이면 가르지 않는다. */
export function splitBody(markdown: string): [string, string | null] {
  const matches = [...markdown.matchAll(/^## /gm)];
  if (matches.length < 2 || matches[1].index === undefined) return [markdown, null];
  const at = matches[1].index;
  return [markdown.slice(0, at).trimEnd(), markdown.slice(at)];
}
