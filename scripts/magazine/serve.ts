/**
 * 작업폴더의 글 파일을 127.0.0.1 에서 UTF-8 글자로 내준다.
 * 브라우저 탭에서 열어 전체 선택·복사한 뒤 다른 사이트 입력창에 붙이는 데 쓴다(한글을 타이핑하면 깨지기 때문).
 *
 *   npm run magazine:serve -- <작업폴더> [포트, 기본 3999]
 *   → http://127.0.0.1:3999/polish_prompt.md
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";

const dir = process.argv[2];
const port = Number(process.argv[3] ?? 3999);
if (!dir) {
  console.error("사용법: npm run magazine:serve -- <작업폴더> [포트]");
  process.exit(1);
}
const root = normalize(dir);

createServer(async (req, res) => {
  const name = decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/^\/+/, "");
  const path = normalize(join(root, name));
  if (!path.startsWith(root + sep) || !/\.(md|txt|json)$/.test(path)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(path);
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}/ 에서 ${root} 를 내주는 중`));
