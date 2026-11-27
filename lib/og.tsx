import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BRAND } from "./brand";

/** 공유 이미지(1200×630) 공통 틀. next/og는 flex 배치와 일부 CSS만 지원한다. */
export const OG_SIZE = { width: 1200, height: 630 };

export async function ogFonts() {
  const dir = join(process.cwd(), "assets", "fonts");
  const [bold, black] = await Promise.all([
    readFile(join(dir, "Pretendard-Bold.otf")),
    readFile(join(dir, "Pretendard-Black.otf")),
  ]);
  return [
    { name: "Pretendard", data: bold, weight: 700 as const, style: "normal" as const },
    { name: "Pretendard", data: black, weight: 900 as const, style: "normal" as const },
  ];
}

/**
 * 공유 이미지 왼쪽 위 G 아이콘(바탕을 뺀 128px). data URI로 넣어 바깥 요청 없이 그린다.
 * 실행 중(ISR)에도 읽히도록 next.config.ts 의 outputFileTracingIncludes 에 이 파일을 넣어 두었다.
 */
export async function ogMark(): Promise<string> {
  const png = await readFile(join(process.cwd(), "public", "brand", "gak-mark-128.png"));
  return `data:image/png;base64,${png.toString("base64")}`;
}

export function OgFrame({
  color,
  label,
  title,
  foot,
  mark,
}: {
  color: string;
  label: string;
  title: string;
  foot: string;
  /** ogMark() 결과 */
  mark: string;
}) {
  const size = title.length > 26 ? 66 : title.length > 16 ? 80 : 96;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "56px 64px",
        background: "#050607",
        backgroundImage: `radial-gradient(circle at 88% 8%, ${color}55, transparent 46%)`,
        color: "#f5f6f3",
        fontFamily: "Pretendard",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 40, fontWeight: 900, letterSpacing: -2 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mark} width={40} height={40} alt="" style={{ marginRight: 12 }} />
          <span>gak</span>
          <span style={{ color: "#ff2438" }}>.gg</span>
        </div>
        <div
          style={{
            display: "flex",
            padding: "10px 20px",
            background: color,
            color: "#050607",
            fontSize: 26,
            fontWeight: 900,
          }}
        >
          {label}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", width: 96, height: 8, background: "#ff2438", marginBottom: 30 }} />
        <div
          style={{
            display: "flex",
            fontSize: size,
            fontWeight: 900,
            lineHeight: 1.14,
            letterSpacing: -4,
            wordBreak: "keep-all",
          }}
        >
          {title}
        </div>
      </div>

      <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#9aa1a5" }}>{foot}</div>
    </div>
  );
}

export const OG_DEFAULT_FOOT = BRAND.tagline;
