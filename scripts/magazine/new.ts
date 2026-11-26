import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ARTICLE_CATEGORIES, ARTICLES_DIR, articleFrontmatterSchema } from "../../lib/articles";

/**
 * 머리말 틀이 든 빈 글 파일을 만든다.
 * 부제·근거가 빈 틀은 스키마에 맞지 않아 사이트가 건너뛰므로, 다 채우기 전에는 실리지 않는다.
 *
 *   npm run magazine:new -- --title "UFC 1, 가장 가벼운 선수가 우승한 밤" --slug ufc-1-royce-gracie --category 격투기
 *   선택: --date 2026-12-05(기본 오늘 KST) --time 19:00(기본 지금 KST) --kicker 썰 --stdout(파일 대신 화면에)
 *
 * 근거(sources)는 빈 자리 세 개로 넣는다. 채우지 않으면 magazine:check 가 실패한다.
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fail(message: string): never {
  console.error(message);
  console.error(
    '사용법: npm run magazine:new -- --title "제목" --slug 영문-slug --category 격투기 [--date YYYY-MM-DD] [--time HH:MM] [--kicker 썰] [--stdout]',
  );
  process.exit(1);
}

const yamlString = (s: string) => JSON.stringify(s);

function main() {
  const title = arg("title") ?? fail("--title 이 없음");
  const slug = arg("slug") ?? fail("--slug 가 없음");
  const category = arg("category") ?? fail(`--category 가 없음(${ARTICLE_CATEGORIES.join(", ")})`);
  const nowKst = new Date(Date.now() + 9 * 3_600_000).toISOString();
  const today = nowKst.slice(0, 10);
  const date = arg("date") ?? today;
  // 앞날 시각이면 그때까지 사이트에 안 보인다. 기본은 지금이다.
  const time = arg("time") ?? nowKst.slice(11, 16);
  const kicker = arg("kicker");

  const shape = articleFrontmatterSchema.pick({ title: true, slug: true, category: true, publishedAt: true, kicker: true });
  const publishedAt = `${date}T${time}:00+09:00`;
  const checked = shape.safeParse({ title, slug, category, publishedAt, kicker });
  if (!checked.success) fail(`머리말 값이 맞지 않음: ${checked.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);

  const text = `---
title: ${yamlString(title)}
deck: ""
slug: ${slug}
category: ${category}
tags:
  - ""
publishedAt: "${publishedAt}"
${kicker ? `kicker: ${yamlString(kicker)}\n` : ""}sources:
  - title: ""
    publisher: ""
    url: ""
  - title: ""
    publisher: ""
    url: ""
  - title: ""
    publisher: ""
    url: ""
keywords: []
eventIds: []
---

첫 문단에서 이 글이 다루는 사실을 바로 말한다.

## 소제목 하나

## 소제목 둘

## 소제목 셋
`;

  if (process.argv.includes("--stdout")) {
    process.stdout.write(text);
    return;
  }
  const path = join(ARTICLES_DIR, `${date}-${slug}.md`);
  if (existsSync(path)) fail(`이미 있는 파일: ${relative(process.cwd(), path)}`);
  mkdirSync(ARTICLES_DIR, { recursive: true });
  writeFileSync(path, text);
  console.log(`만듦: ${relative(process.cwd(), path)} (다 쓰면 npm run magazine:check -- 이 파일)`);
}

main();
