import { fetchUrl, sha1 } from "./extract";
import type { CrawlMemory } from "./website";

/**
 * RSS feed crawler — fetches a feed (Google News / Naver News /
 * generic RSS), parses items, filters by brand keyword, and emits one
 * memory per new article (vs the prior snapshot's set of GUIDs).
 *
 * No LLM call — RSS items are already structured. Memory body = title
 * + 1-line description + link. Date of publication retained.
 */

export type RssItem = {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
  guid: string;
};

export type NewsCrawlResult = {
  noChange: boolean;
  newHash: string;
  newSnapshot: { items: RssItem[]; fetchedAt: string };
  memories: CrawlMemory[];
};

function decodeEnt(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickTag(item: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = item.match(re);
  return m ? decodeEnt(m[1]) : "";
}

function parseRss(xml: string): RssItem[] {
  const out: RssItem[] = [];

  // RSS 2.0 / Atom both — handle <item> and <entry>
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml))) {
    const body = m[1];
    const title = pickTag(body, "title");
    const link = pickTag(body, "link") || pickTag(body, "guid");
    const desc = pickTag(body, "description") || pickTag(body, "content:encoded");
    const pub = pickTag(body, "pubDate") || pickTag(body, "dc:date");
    const guid = pickTag(body, "guid") || link || title;
    if (title) {
      out.push({
        title: title.slice(0, 300),
        link: link.slice(0, 500),
        description: desc.slice(0, 600),
        pubDate: pub || null,
        guid: guid.slice(0, 500),
      });
    }
  }
  // Atom feed fallback
  if (out.length === 0) {
    const entryRe = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
    while ((m = entryRe.exec(xml))) {
      const body = m[1];
      const title = pickTag(body, "title");
      const linkMatch = body.match(/<link[^>]*href="([^"]+)"/i);
      const link = linkMatch ? linkMatch[1] : "";
      const desc = pickTag(body, "summary") || pickTag(body, "content");
      const pub = pickTag(body, "published") || pickTag(body, "updated");
      const guid = pickTag(body, "id") || link;
      if (title) {
        out.push({
          title: title.slice(0, 300),
          link: link.slice(0, 500),
          description: desc.slice(0, 600),
          pubDate: pub || null,
          guid: guid.slice(0, 500),
        });
      }
    }
  }

  // Most-recent first — cap to 30 items so a noisy feed doesn't flood memories
  return out.slice(0, 30);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export async function crawlNewsRss(input: {
  url: string;
  brandFilter: string | null; // case-insensitive substring filter on title+description
  prevSnapshot: { items: RssItem[] } | null;
  prevHash: string | null;
}): Promise<NewsCrawlResult> {
  const xml = await fetchUrl(input.url);
  const items = parseRss(xml);
  const newHash = sha1(items.map((i) => i.guid).join("|"));

  if (input.prevHash && input.prevHash === newHash) {
    return {
      noChange: true,
      newHash,
      newSnapshot: { items, fetchedAt: new Date().toISOString() },
      memories: [],
    };
  }

  const prevGuids = new Set(input.prevSnapshot?.items.map((i) => i.guid) ?? []);

  let newItems = items.filter((i) => !prevGuids.has(i.guid));
  if (input.brandFilter && input.brandFilter.trim()) {
    const f = input.brandFilter.toLowerCase();
    newItems = newItems.filter(
      (i) =>
        i.title.toLowerCase().includes(f) ||
        i.description.toLowerCase().includes(f),
    );
  }

  const memories: CrawlMemory[] = newItems.slice(0, 8).map((item) => ({
    title: `📰 ${item.title}`.slice(0, 120),
    body: [
      item.description?.slice(0, 280),
      fmtDate(item.pubDate),
      item.link,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 500),
    kind: "context" as const,
    importance: 55,
  }));

  return {
    noChange: newItems.length === 0,
    newHash,
    newSnapshot: { items, fetchedAt: new Date().toISOString() },
    memories,
  };
}
