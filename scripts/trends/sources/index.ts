import type { SourceAdapter } from "../types";
import { bobaedream } from "./bobaedream";
import { clien } from "./clien";
import { dcinside } from "./dcinside";
import { dogdrip } from "./dogdrip";
import { fmkorea } from "./fmkorea";
import { inven } from "./inven";
import { ruliweb } from "./ruliweb";

/**
 * 쓰는 소스. 빠진 곳과 이유(11-26 확인):
 *  - 엠엘비파크: robots.txt 가 User-agent * 에 Disallow: / (검색엔진만 허용)
 *  - 뽐뿌: 이 맥에서 사이트 전체가 403(nginx)
 *  - 아카라이브: 클라우드플레어 확인 화면(403)
 */
export const SOURCES: SourceAdapter[] = [fmkorea, dcinside, ruliweb, bobaedream, inven, dogdrip, clien];
