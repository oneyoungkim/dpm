import { BRAND } from "@/lib/brand";

/**
 * 애드센스가 요구하는 ads.txt.
 * 게시자 ID가 환경변수에 들어오기 전에는 404를 낸다(틀린 줄을 싣는 것보다 없는 편이 낫다).
 */
export function GET() {
  const publisher = BRAND.adsenseClient.replace(/^ca-/, "");
  if (!/^pub-\d+$/.test(publisher)) return new Response("Not found", { status: 404 });
  return new Response(`google.com, ${publisher}, DIRECT, f08c47fec0942fa0\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
