import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";
import { OG_SIZE, OgFrame, ogFonts, ogMark } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = `${BRAND.name} ${BRAND.domain} — ${BRAND.tagline}`;

export default async function Image() {
  const [fonts, mark] = await Promise.all([ogFonts(), ogMark()]);
  return new ImageResponse(
    (
      <OgFrame
        color="#c7ff16"
        label="순위 · 일정 · 매거진"
        title={BRAND.tagline}
        foot="지금 남자 커뮤니티에서 뜨는 말"
        mark={mark}
      />
    ),
    { ...size, fonts },
  );
}
