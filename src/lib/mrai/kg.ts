import { getLLMProvider } from "@/lib/llm";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Mr. AI Knowledge Graph — entity-relation extraction + retrieval.
 *
 * Runs as a side-effect of memory save. Same idea as memory extraction
 * (LLM looks at the new turn and decides what's worth saving) but the
 * output is structured triples (entity-relation-entity) instead of
 * free-text facts.
 *
 * Why separate from memory extraction:
 *   - Different output shape (triples vs facts)
 *   - Cheaper LLM model can run the KG pass (Haiku) since structure is rigid
 *   - Failure of one doesn't block the other
 */

export type EntityKind =
  | "person" | "company" | "product" | "customer_segment"
  | "technology" | "market" | "decision" | "metric"
  | "competitor" | "other";

export type RelationType =
  | "targets" | "uses" | "competes_with" | "located_in"
  | "depends_on" | "works_at" | "mentioned_with" | "other";

export interface ExtractedEntity {
  name: string;
  kind: EntityKind;
  summary?: string;
}

export interface ExtractedRelation {
  src: string;     // entity name
  dst: string;     // entity name
  type: RelationType;
  detail?: string;
}

export interface EntityRow {
  id: string;
  name: string;
  kind: EntityKind;
  summary: string | null;
  mention_count: number;
}

export interface RelationRow {
  id: string;
  src_entity_id: string;
  dst_entity_id: string;
  relation_type: RelationType;
  detail: string | null;
  weight: number;
}

const ENTITY_KINDS: EntityKind[] = [
  "person", "company", "product", "customer_segment",
  "technology", "market", "decision", "metric",
  "competitor", "other",
];
const RELATION_TYPES: RelationType[] = [
  "targets", "uses", "competes_with", "located_in",
  "depends_on", "works_at", "mentioned_with", "other",
];

/**
 * Extract entities + relations from a user/assistant turn pair.
 * Conservative: returns empty arrays when there's nothing graphable
 * (greetings, vague chitchat). The LLM is instructed to skip rather
 * than invent.
 */
export async function extractKgFromTurn(input: {
  userMessage: string;
  assistantReply: string;
  existingEntities: Array<{ name: string; kind: EntityKind }>;
}): Promise<{ entities: ExtractedEntity[]; relations: ExtractedRelation[] }> {
  const existingBrief = input.existingEntities.length
    ? input.existingEntities
        .slice(0, 30)
        .map((e) => `- ${e.name} (${e.kind})`)
        .join("\n")
    : "(아직 그래프 비어있음)";

  const system = `당신은 사용자 대화에서 지식 그래프 (Knowledge Graph) 를 추출합니다.

엔티티 종류 (이 중 하나만):
- person · 사람 (CEO, 직원, 투자자)
- company · 회사 (자사, 파트너사, 고객사)
- product · 제품/서비스
- customer_segment · 고객군 (K-product 수출 기업, 1인 사장, 등)
- technology · 기술 (Claude, pgvector, 등)
- market · 시장/지역 (한국, 일본, 동남아)
- decision · 결정 사항
- metric · 숫자/목표 (MRR, NPS, 전환율)
- competitor · 경쟁사
- other · 그 외

관계 종류 (이 중 하나만):
- targets · A가 B(고객/시장)을 타겟함
- uses · A가 B(기술/도구)를 사용함
- competes_with · A가 B와 경쟁함
- located_in · A가 B(지역)에 있음
- depends_on · A가 B에 의존함
- works_at · 사람 A가 회사 B에 소속됨
- mentioned_with · 약한 동반 등장 (정확한 관계 모를 때)
- other · 위 어디에도 안 맞음

추출 규칙:
- 새로운 사실만 추출. 기존 entities (아래 목록)에 이미 있으면 entities에 다시 안 넣어도 됨 — relations만 추가.
- 인사·chitchat·일반 질문 → 빈 배열 반환.
- entity name은 canonical form (예: "마켓트윈" → "Market Twin", "K-뷰티" → "K-Beauty").
- 추측 금지 — 명시되지 않은 관계는 만들지 않음.

JSON 출력 형식:
{
  "entities": [
    { "name": "...", "kind": "...", "summary": "한 줄 설명 (옵션)" }
  ],
  "relations": [
    { "src": "엔티티 이름", "dst": "엔티티 이름", "type": "...", "detail": "옵션 자유 텍스트" }
  ]
}`;

  const prompt = `## 이미 존재하는 entities
${existingBrief}

## 사용자 발화
"${input.userMessage}"

## AI 답변 (맥락)
"${input.assistantReply}"

위 발화에서 추출할 entities + relations를 JSON으로 반환하세요. 새로운 게 없으면 빈 배열.`;

  const provider = getLLMProvider({ provider: "anthropic", model: "claude-haiku-4-5-20251001" });
  const res = await provider.generate({
    system,
    prompt,
    temperature: 0.1,
    maxTokens: 1000,
    cacheSystem: false,
    jsonSchema: {
      type: "object",
      required: ["entities", "relations"],
      properties: {
        entities: {
          type: "array",
          items: {
            type: "object",
            required: ["name", "kind"],
            properties: {
              name: { type: "string", maxLength: 80 },
              kind: { type: "string", enum: ENTITY_KINDS },
              summary: { type: "string", maxLength: 200 },
            },
          },
        },
        relations: {
          type: "array",
          items: {
            type: "object",
            required: ["src", "dst", "type"],
            properties: {
              src: { type: "string", maxLength: 80 },
              dst: { type: "string", maxLength: 80 },
              type: { type: "string", enum: RELATION_TYPES },
              detail: { type: "string", maxLength: 200 },
            },
          },
        },
      },
    },
  });

  const json = (res.json as { entities?: ExtractedEntity[]; relations?: ExtractedRelation[] }) ?? {};
  const entities = (Array.isArray(json.entities) ? json.entities : []).filter(
    (e): e is ExtractedEntity =>
      !!e && typeof e.name === "string" && e.name.trim().length > 0 && ENTITY_KINDS.includes(e.kind),
  );
  const relations = (Array.isArray(json.relations) ? json.relations : []).filter(
    (r): r is ExtractedRelation =>
      !!r &&
      typeof r.src === "string" &&
      typeof r.dst === "string" &&
      r.src.trim().length > 0 &&
      r.dst.trim().length > 0 &&
      r.src !== r.dst &&
      RELATION_TYPES.includes(r.type),
  );
  return { entities, relations };
}

/**
 * Upsert entities by case-insensitive (workspace, name). Returns a map
 * of input name → row id so the caller can build relations.
 */
async function upsertEntities(input: {
  workspaceId: string;
  entities: ExtractedEntity[];
}): Promise<Map<string, EntityRow>> {
  const supabase = createServiceClient();
  const out = new Map<string, EntityRow>();
  if (input.entities.length === 0) return out;

  // First, look up existing entities by lower(name) so we don't lose
  // mention_count or kind on collision.
  const lowerNames = input.entities.map((e) => e.name.toLowerCase());
  const { data: existing } = await supabase
    .from("mrai_entities")
    .select("id, name, kind, summary, mention_count")
    .eq("workspace_id", input.workspaceId)
    .in("name", input.entities.map((e) => e.name))
    .limit(500);

  // Case-insensitive index from DB rows
  const existingByLower = new Map<string, EntityRow>();
  for (const row of (existing ?? []) as EntityRow[]) {
    existingByLower.set(row.name.toLowerCase(), row);
  }
  // Supabase eq doesn't do case-insensitive matching, so we ALSO probe
  // with lower-case variants the user might type. Cheap second query.
  if (lowerNames.length > 0) {
    const { data: existing2 } = await supabase
      .from("mrai_entities")
      .select("id, name, kind, summary, mention_count")
      .eq("workspace_id", input.workspaceId)
      .filter("name", "ilike", `%`) // permissive — we'll filter client-side
      .limit(500);
    for (const row of (existing2 ?? []) as EntityRow[]) {
      const k = row.name.toLowerCase();
      if (lowerNames.includes(k) && !existingByLower.has(k)) {
        existingByLower.set(k, row);
      }
    }
  }

  for (const e of input.entities) {
    const key = e.name.toLowerCase();
    const found = existingByLower.get(key);
    if (found) {
      // Bump mention count + update summary if richer
      const newCount = found.mention_count + 1;
      const newSummary = e.summary && (!found.summary || e.summary.length > found.summary.length)
        ? e.summary
        : found.summary;
      const { data: updated } = await supabase
        .from("mrai_entities")
        .update({
          mention_count: newCount,
          summary: newSummary,
          updated_at: new Date().toISOString(),
        })
        .eq("id", found.id)
        .select("id, name, kind, summary, mention_count")
        .single();
      if (updated) out.set(e.name, updated as EntityRow);
    } else {
      const { data: inserted, error } = await supabase
        .from("mrai_entities")
        .insert({
          workspace_id: input.workspaceId,
          name: e.name,
          kind: e.kind,
          summary: e.summary ?? null,
        })
        .select("id, name, kind, summary, mention_count")
        .single();
      if (!error && inserted) {
        out.set(e.name, inserted as EntityRow);
        existingByLower.set(key, inserted as EntityRow);
      }
    }
  }
  return out;
}

/**
 * Insert or bump-weight relations, resolving entity names to ids by
 * checking the upserted-entities map first, then falling back to a
 * workspace lookup (for relations that reference pre-existing
 * entities not mentioned in this turn's `entities`).
 */
async function upsertRelations(input: {
  workspaceId: string;
  relations: ExtractedRelation[];
  entityMap: Map<string, EntityRow>;
  sourceMemoryId: string | null;
}): Promise<void> {
  if (input.relations.length === 0) return;
  const supabase = createServiceClient();

  // For unresolved names, fetch from DB by case-insensitive match.
  const unresolved = new Set<string>();
  for (const r of input.relations) {
    if (!input.entityMap.has(r.src)) unresolved.add(r.src);
    if (!input.entityMap.has(r.dst)) unresolved.add(r.dst);
  }
  if (unresolved.size > 0) {
    const { data: looked } = await supabase
      .from("mrai_entities")
      .select("id, name, kind, summary, mention_count")
      .eq("workspace_id", input.workspaceId)
      .limit(500);
    const lookedByLower = new Map<string, EntityRow>();
    for (const row of (looked ?? []) as EntityRow[]) {
      lookedByLower.set(row.name.toLowerCase(), row);
    }
    for (const n of unresolved) {
      const row = lookedByLower.get(n.toLowerCase());
      if (row) input.entityMap.set(n, row);
    }
  }

  for (const r of input.relations) {
    const src = input.entityMap.get(r.src);
    const dst = input.entityMap.get(r.dst);
    if (!src || !dst) continue; // Can't form the edge — drop quietly.

    // Try insert; on unique-conflict bump weight + update detail.
    const { error: insErr } = await supabase
      .from("mrai_relations")
      .insert({
        workspace_id: input.workspaceId,
        src_entity_id: src.id,
        dst_entity_id: dst.id,
        relation_type: r.type,
        detail: r.detail ?? null,
        source_memory_id: input.sourceMemoryId,
      });
    if (insErr) {
      // Unique violation → bump weight
      const { data: existing } = await supabase
        .from("mrai_relations")
        .select("id, weight, detail")
        .eq("workspace_id", input.workspaceId)
        .eq("src_entity_id", src.id)
        .eq("dst_entity_id", dst.id)
        .eq("relation_type", r.type)
        .maybeSingle();
      if (existing) {
        await supabase
          .from("mrai_relations")
          .update({
            weight: (existing as { weight: number }).weight + 1,
            detail: r.detail ?? (existing as { detail: string | null }).detail,
            updated_at: new Date().toISOString(),
          })
          .eq("id", (existing as { id: string }).id);
      }
    }
  }
}

/**
 * Top-level: extract entities + relations from a turn and persist them.
 * Fire-and-forget from the chat orchestrator; failures are logged but
 * never block the user-facing reply.
 */
export async function saveKgFromTurn(input: {
  workspaceId: string;
  userMessage: string;
  assistantReply: string;
  sourceMemoryId: string | null;
}): Promise<{ entities: number; relations: number }> {
  const supabase = createServiceClient();
  const { data: existingRows } = await supabase
    .from("mrai_entities")
    .select("name, kind")
    .eq("workspace_id", input.workspaceId)
    .limit(50);
  const existing = ((existingRows ?? []) as Array<{ name: string; kind: EntityKind }>);

  const extracted = await extractKgFromTurn({
    userMessage: input.userMessage,
    assistantReply: input.assistantReply,
    existingEntities: existing,
  });

  if (extracted.entities.length === 0 && extracted.relations.length === 0) {
    return { entities: 0, relations: 0 };
  }

  const entityMap = await upsertEntities({
    workspaceId: input.workspaceId,
    entities: extracted.entities,
  });

  await upsertRelations({
    workspaceId: input.workspaceId,
    relations: extracted.relations,
    entityMap,
    sourceMemoryId: input.sourceMemoryId,
  });

  return { entities: extracted.entities.length, relations: extracted.relations.length };
}

/**
 * Pull the subgraph around entities the user's question mentions.
 * Cheap heuristic: case-insensitive substring of any entity name in the
 * query text. For v0 that's good enough; semantic match later.
 */
export async function findRelevantSubgraph(input: {
  workspaceId: string;
  queryText: string;
  maxEntities?: number;
}): Promise<{ entities: EntityRow[]; relations: Array<RelationRow & { src_name: string; dst_name: string }> }> {
  const maxEntities = input.maxEntities ?? 8;
  const supabase = createServiceClient();

  // Pull all workspace entities (cheap for our scale — ≤ a few thousand).
  const { data: allEntities } = await supabase
    .from("mrai_entities")
    .select("id, name, kind, summary, mention_count")
    .eq("workspace_id", input.workspaceId)
    .order("mention_count", { ascending: false })
    .limit(500);

  const allRows = ((allEntities ?? []) as EntityRow[]);
  if (allRows.length === 0) return { entities: [], relations: [] };

  // Detect mentioned entities by substring match (case-insensitive).
  const ql = input.queryText.toLowerCase();
  const matched: EntityRow[] = allRows
    .filter((e) => ql.includes(e.name.toLowerCase()))
    .slice(0, maxEntities);

  if (matched.length === 0) return { entities: [], relations: [] };

  const ids = matched.map((e) => e.id);
  const { data: relRows } = await supabase
    .from("mrai_relations")
    .select("id, src_entity_id, dst_entity_id, relation_type, detail, weight")
    .eq("workspace_id", input.workspaceId)
    .or(`src_entity_id.in.(${ids.join(",")}),dst_entity_id.in.(${ids.join(",")})`)
    .limit(60);

  const relations = (relRows ?? []) as RelationRow[];
  // Expand entities with the other endpoint of each relation so the
  // LLM sees both sides of every edge in the evidence pack.
  const neededIds = new Set<string>(ids);
  for (const r of relations) {
    neededIds.add(r.src_entity_id);
    neededIds.add(r.dst_entity_id);
  }
  const byId = new Map<string, EntityRow>();
  for (const e of allRows) byId.set(e.id, e);
  const allNeeded: EntityRow[] = Array.from(neededIds)
    .map((id) => byId.get(id))
    .filter((e): e is EntityRow => !!e);

  const namedRelations = relations.map((r) => ({
    ...r,
    src_name: byId.get(r.src_entity_id)?.name ?? "?",
    dst_name: byId.get(r.dst_entity_id)?.name ?? "?",
  }));

  return { entities: allNeeded, relations: namedRelations };
}

export function formatSubgraphForPrompt(
  sub: { entities: EntityRow[]; relations: Array<RelationRow & { src_name: string; dst_name: string }> },
  locale: "ko" | "en" = "ko",
): string {
  if (sub.entities.length === 0) return "";

  const header =
    locale === "en"
      ? "## Knowledge Graph (relevant subgraph)\nThese are structured entities and relations the system already knows.\n"
      : "## Knowledge Graph (질문 관련 subgraph)\n시스템이 이미 알고 있는 구조화된 엔티티와 관계입니다.\n";

  const entLines = sub.entities
    .map((e) => `- ${e.name} (${e.kind}${e.summary ? ` — ${e.summary}` : ""})`)
    .join("\n");

  const relLines = sub.relations.length
    ? sub.relations
        .map((r) => `- ${r.src_name} --[${r.relation_type}${r.detail ? `:${r.detail}` : ""}]--> ${r.dst_name}`)
        .join("\n")
    : locale === "en"
    ? "(no relations connecting these yet)"
    : "(아직 이들 사이 관계 없음)";

  return `${header}\n### Entities\n${entLines}\n\n### Relations\n${relLines}`;
}
