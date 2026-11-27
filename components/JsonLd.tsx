/**
 * 구조화 데이터(JSON-LD)를 <script type="application/ld+json"> 하나로 싣는다.
 * 값은 lib/structured-data.ts 가 만든다. 한 페이지에 여러 덩어리를 실을 때는 배열로 넘긴다.
 * "<" 를 < 로 바꿔, 글 제목 같은 값에 태그가 섞여도 스크립트가 끊기지 않게 한다.
 */
export function JsonLd({ data }: { data: object | object[] | null | undefined }) {
  if (!data || (Array.isArray(data) && data.length === 0)) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
