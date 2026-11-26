/**
 * 보조 수집본.
 *
 * 깃허브 서버(해외 데이터센터 IP)의 접속을 막는 커뮤니티가 있다(2026-11-26: 에펨코리아 430, 개드립 403).
 * 그런 곳만 한국에 있는 다른 컴퓨터가 같은 방식(robots.txt 확인, 목록 페이지만)으로 읽어 파일로 넘긴다.
 *
 *   읽는 쪽:  tsx scripts/trends/run.ts --only fmkorea,dogdrip --feed-out <파일>
 *   쓰는 쪽:  tsx scripts/trends/run.ts --feed-in <파일>
 *
 * 집계는 직접 읽기에 실패한 소스에 한해, 너무 오래되지 않은 수집본의 글을 대신 쓴다.
 * 직접 읽기가 되는 소스는 수집본이 있어도 직접 읽은 것을 쓴다.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import type { RawPost, SourceResult } from "./types";

/** 이보다 오래된 수집본은 쓰지 않는다(집계가 2시간마다라 한 번 건너뛴 것까지는 받아 준다) */
export const FEED_MAX_AGE_MIN = 180;

const postSchema = z.object({
  source: z.string(),
  title: z.string().min(1).max(300),
  url: z.string().min(1).max(500),
  board: z.string().max(80),
  views: z.number().nullable(),
  likes: z.number().nullable(),
  comments: z.number().nullable(),
  politicsFlag: z.boolean().optional(),
  skip: z.boolean().optional(),
  adultBoard: z.boolean().optional(),
});

const feedSchema = z.object({
  generatedAt: z.string(),
  sources: z.array(z.object({ id: z.string(), ok: z.boolean(), posts: z.array(postSchema).max(500) })),
});

export type FeedFile = z.infer<typeof feedSchema>;

export function writeFeed(path: string, results: SourceResult[], now = new Date()): FeedFile {
  const file: FeedFile = {
    generatedAt: now.toISOString(),
    sources: results.map((r) => ({ id: r.adapter.id, ok: r.ok, posts: r.posts })),
  };
  writeFileSync(path, `${JSON.stringify(file)}\n`);
  return file;
}

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.host : null;
  } catch {
    return null;
  }
}

/**
 * 실패한 소스를 수집본으로 메운다. results 를 그 자리에서 고치고, 무슨 일이 있었는지 한 줄씩 돌려준다.
 * 수집본은 바깥에서 받은 파일이라 모양과 주소를 확인하고 쓴다(글 주소의 호스트가 그 소스의 목록 주소와 같아야 한다).
 */
export function applyFeed(results: SourceResult[], path: string, now = Date.now()): string[] {
  let feed: FeedFile;
  try {
    feed = feedSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return [code === "ENOENT" ? "보조 수집본 없음" : `보조 수집본을 읽지 못해 쓰지 않음(${err instanceof Error ? err.message.split("\n")[0] : String(err)})`];
  }

  const ageMin = (now - Date.parse(feed.generatedAt)) / 60_000;
  if (!Number.isFinite(ageMin) || ageMin < -10) return ["보조 수집본의 시각이 이상해 쓰지 않음(읽을 수 없거나 앞날)"];
  if (ageMin > FEED_MAX_AGE_MIN) return [`보조 수집본이 ${Math.round(ageMin)}분 전 것이라 쓰지 않음(기준 ${FEED_MAX_AGE_MIN}분)`];

  const lines: string[] = [];
  for (const r of results) {
    if (r.ok) continue;
    const hit = feed.sources.find((s) => s.id === r.adapter.id && s.ok);
    if (!hit) continue;
    const host = hostOf(r.adapter.listUrl);
    const posts: RawPost[] = hit.posts.filter((p) => p.source === r.adapter.id && host !== null && hostOf(p.url) === host);
    if (posts.length === 0) continue;
    const directError = r.error;
    r.posts = posts;
    r.ok = true;
    r.error = undefined;
    r.note = `보조 수집 ${Math.round(ageMin)}분 전`;
    lines.push(`${r.adapter.name}: 직접 읽기 실패(${directError ?? "이유 모름"}) → 보조 수집본 ${posts.length}건 사용`);
  }
  if (lines.length === 0) lines.push("보조 수집본을 쓸 소스 없음");
  return lines;
}
