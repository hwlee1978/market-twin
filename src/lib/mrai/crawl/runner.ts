import { createServiceClient } from "@/lib/supabase/server";
import { crawlWebsite, type CrawlMemory } from "./website";
import { crawlNewsRss, type RssItem } from "./news-rss";
import { loadWorkspaceMemories } from "../memory";

/**
 * Run one crawl source — shared between manual trigger (POST .../fetch)
 * and cron sweep. Updates the source row with new snapshot + emits new
 * memory rows tagged with crawl_source_id.
 */

export type CrawlRunResult = {
  status: "ok" | "no_change" | "failed";
  memories_added: number;
  error?: string;
};

type Source = {
  id: string;
  workspace_id: string;
  source_type: "self_website" | "news_rss" | "competitor";
  url: string;
  label: string | null;
  brand_filter: string | null;
  last_snapshot: { text?: string; title?: string | null; items?: unknown[] } | null;
  last_snapshot_hash: string | null;
  fail_count: number;
  memories_emitted: number;
};

async function buildBrandContext(workspaceId: string): Promise<string> {
  // Take top-8 most important memories as compact brand context.
  try {
    const mems = await loadWorkspaceMemories(workspaceId);
    return mems
      .slice(0, 8)
      .map((m) => `- ${m.title ?? ""}: ${m.body.slice(0, 200)}`)
      .join("\n");
  } catch {
    return "";
  }
}

export async function runCrawlSource(sourceId: string): Promise<CrawlRunResult> {
  const svc = createServiceClient();
  const { data: src, error: loadErr } = await svc
    .from("mrai_crawl_sources")
    .select(
      "id, workspace_id, source_type, url, label, brand_filter, last_snapshot, last_snapshot_hash, fail_count, memories_emitted",
    )
    .eq("id", sourceId)
    .single();
  if (loadErr || !src) {
    return { status: "failed", memories_added: 0, error: loadErr?.message ?? "not_found" };
  }
  const source = src as Source;

  const brandContext = await buildBrandContext(source.workspace_id);

  try {
    let memories: CrawlMemory[] = [];
    let newHash: string;
    let newSnapshot: Record<string, unknown>;

    if (source.source_type === "news_rss") {
      const prevItems = (source.last_snapshot?.items ?? []) as RssItem[];
      const r = await crawlNewsRss({
        url: source.url,
        brandFilter: source.brand_filter,
        prevSnapshot: source.last_snapshot ? { items: prevItems } : null,
        prevHash: source.last_snapshot_hash,
      });
      if (r.noChange) {
        await svc
          .from("mrai_crawl_sources")
          .update({
            last_fetched_at: new Date().toISOString(),
            last_snapshot: r.newSnapshot,
            last_snapshot_hash: r.newHash,
            last_error: null,
            fail_count: 0,
          })
          .eq("id", source.id);
        return { status: "no_change", memories_added: 0 };
      }
      memories = r.memories;
      newHash = r.newHash;
      newSnapshot = r.newSnapshot;
    } else {
      const r = await crawlWebsite({
        url: source.url,
        sourceType: source.source_type as "self_website" | "competitor",
        brandContext,
        prevSnapshot: source.last_snapshot
          ? {
              text: source.last_snapshot.text ?? "",
              title: source.last_snapshot.title ?? null,
            }
          : null,
        prevHash: source.last_snapshot_hash,
      });
      if (r.noChange) {
        await svc
          .from("mrai_crawl_sources")
          .update({
            last_fetched_at: new Date().toISOString(),
            last_snapshot: r.newSnapshot,
            last_snapshot_hash: r.newHash,
            last_error: null,
            fail_count: 0,
          })
          .eq("id", source.id);
        return { status: "no_change", memories_added: 0 };
      }
      memories = r.memories;
      newHash = r.newHash;
      newSnapshot = r.newSnapshot;
    }

    // Insert memories — tag with crawl_source_id for audit + future
    // dedupe.
    if (memories.length > 0) {
      const rows = memories.map((m) => ({
        workspace_id: source.workspace_id,
        kind: m.kind,
        title: m.title,
        body: m.body,
        crawl_source_id: source.id,
      }));
      const { error: insErr } = await svc.from("mrai_memories").insert(rows);
      if (insErr) {
        // Don't fail the whole run — still update snapshot so we don't
        // re-emit on next tick.
        console.warn(`[crawl] memory insert failed:`, insErr.message);
      }
    }

    await svc
      .from("mrai_crawl_sources")
      .update({
        last_fetched_at: new Date().toISOString(),
        last_snapshot: newSnapshot,
        last_snapshot_hash: newHash,
        last_error: null,
        fail_count: 0,
        memories_emitted: source.memories_emitted + memories.length,
      })
      .eq("id", source.id);

    return { status: "ok", memories_added: memories.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_failed";
    await svc
      .from("mrai_crawl_sources")
      .update({
        last_fetched_at: new Date().toISOString(),
        last_error: msg,
        fail_count: source.fail_count + 1,
      })
      .eq("id", source.id);
    return { status: "failed", memories_added: 0, error: msg };
  }
}
