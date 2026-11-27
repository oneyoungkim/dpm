/**
 * IndexNow 키 파일(https://gak.gg/indexnow-key.txt).
 * 네이버·빙에 새 글을 알릴 때(scripts/seo/indexnow.ts) 이 주소를 keyLocation 으로 넘기면,
 * 받는 쪽이 이 파일을 읽어 키가 맞는지 확인한다.
 * 키(INDEXNOW_KEY)가 없거나 규칙(영문·숫자·하이픈 8~128자)에 안 맞으면 404를 낸다.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const key = process.env.INDEXNOW_KEY?.trim() ?? "";
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) return new Response("Not found", { status: 404 });
  return new Response(key, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
