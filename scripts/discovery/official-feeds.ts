import { XMLParser } from "fast-xml-parser";

export interface OfficialFeed {
  id: string;
  name: string;
  feedUrl: string;
  allowedHosts: string[];
  categoryHint: "게임" | "테크";
}

export interface FeedItem {
  sourceId: string;
  sourceName: string;
  categoryHint: "게임" | "테크";
  title: string;
  url: string;
  publishedAt?: string;
  text: string;
}

export const OFFICIAL_FEEDS: OfficialFeed[] = [
  {
    id: "apple-newsroom",
    name: "Apple Newsroom",
    feedUrl: "https://www.apple.com/newsroom/rss-feed.rss",
    allowedHosts: ["apple.com", "www.apple.com"],
    categoryHint: "테크",
  },
  {
    id: "samsung-newsroom",
    name: "Samsung Global Newsroom",
    feedUrl: "https://news.samsung.com/global/feed",
    allowedHosts: ["samsung.com", "news.samsung.com"],
    categoryHint: "테크",
  },
  {
    id: "playstation-blog",
    name: "PlayStation Blog",
    feedUrl: "https://blog.playstation.com/feed/",
    allowedHosts: ["playstation.com", "blog.playstation.com"],
    categoryHint: "게임",
  },
  {
    id: "xbox-wire",
    name: "Xbox Wire",
    feedUrl: "https://news.xbox.com/en-us/feed/",
    allowedHosts: ["xbox.com", "news.xbox.com"],
    categoryHint: "게임",
  },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: false,
});

function list<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function plainText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return plainText(record["#text"] ?? record.__cdata ?? record.description ?? record.summary ?? "");
}

function cleanHtml(value: unknown): string {
  return plainText(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function atomLink(value: unknown): string {
  for (const link of list(value)) {
    if (typeof link === "string") return link;
    if (link && typeof link === "object") {
      const item = link as Record<string, unknown>;
      if ((!item["@_rel"] || item["@_rel"] === "alternate") && typeof item["@_href"] === "string") {
        return item["@_href"];
      }
    }
  }
  return "";
}

function hostAllowed(url: string, allowedHosts: string[]): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

export function parseOfficialFeed(xml: string, source: OfficialFeed): FeedItem[] {
  const data = parser.parse(xml) as Record<string, unknown>;
  const rss = data.rss as { channel?: { item?: unknown } } | undefined;
  const atom = data.feed as { entry?: unknown } | undefined;
  const rawItems = rss?.channel ? list(rss.channel.item) : list(atom?.entry);

  return rawItems.flatMap((raw): FeedItem[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const title = cleanHtml(item.title);
    const url = cleanHtml(item.link) || atomLink(item.link);
    if (!title || !url || !hostAllowed(url, source.allowedHosts)) return [];

    const summary = cleanHtml(item.description ?? item.summary ?? item.content ?? item["content:encoded"]);
    const publishedAt = cleanHtml(item.pubDate ?? item.published ?? item.updated) || undefined;
    return [{
      sourceId: source.id,
      sourceName: source.name,
      categoryHint: source.categoryHint,
      title,
      url,
      publishedAt,
      text: summary.slice(0, 1_800),
    }];
  });
}

export async function fetchOfficialFeed(source: OfficialFeed, limit = 8): Promise<FeedItem[]> {
  const response = await fetch(source.feedUrl, {
    headers: {
      accept: "application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9",
      "user-agent": "MatchdayBot/0.1 (+https://github.com/matchday)",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return parseOfficialFeed(await response.text(), source).slice(0, limit);
}

export async function fetchAllOfficialFeeds(limitPerFeed = 8): Promise<FeedItem[]> {
  const settled = await Promise.allSettled(
    OFFICIAL_FEEDS.map(async (source) => {
      const items = await fetchOfficialFeed(source, limitPerFeed);
      console.log(` - ${source.name}: 원문 ${items.length}건`);
      return items;
    }),
  );

  return settled.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value;
    console.warn(` - ${OFFICIAL_FEEDS[index].name}: 실패 (${result.reason})`);
    return [];
  });
}
