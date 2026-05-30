-- pgvector cosine similarity RPC for challenge recommendation engine.
-- Used by src/lib/challenge/recommend.ts Stage 1 retrieval.
--
-- Returns top-N programs with cosine similarity score (1 - distance,
-- so higher = closer match, range [0, 1] typically — can dip slightly
-- below 0 for opposite vectors).
--
-- security definer because the function reads ch_pp_programs /
-- ch_voucher_programs which have RLS disabled but service-role-only
-- intent. Public role calls this via Supabase RPC.

create or replace function public.ch_match_pp_programs(
  query_embedding vector(1536),
  match_count int default 30
)
returns table (
  id uuid,
  program_name text,
  program_purpose text,
  eligibility text,
  support_content text,
  application_period text,
  organization text,
  similarity float
)
language sql
stable
as $$
  select
    p.id,
    p.program_name,
    p.program_purpose,
    p.eligibility,
    p.support_content,
    p.application_period,
    p.organization,
    1 - (p.embedding <=> query_embedding) as similarity
  from public.ch_pp_programs p
  where p.embedding is not null
  order by p.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.ch_match_voucher_programs(
  query_embedding vector(1536),
  match_count int default 30
)
returns table (
  id uuid,
  program_name text,
  eligibility text,
  support_content text,
  application_period text,
  organization text,
  similarity float
)
language sql
stable
as $$
  select
    p.id,
    p.program_name,
    p.eligibility,
    p.support_content,
    p.application_period,
    p.organization,
    1 - (p.embedding <=> query_embedding) as similarity
  from public.ch_voucher_programs p
  where p.embedding is not null
  order by p.embedding <=> query_embedding
  limit match_count;
$$;

-- Product matching (Phase B side-quest — find similar past products for
-- "이 제품 비슷한 사례" feature).
create or replace function public.ch_match_pp_products(
  query_embedding vector(1536),
  match_count int default 20
)
returns table (
  id uuid,
  product_name text,
  category text,
  description text,
  similarity float
)
language sql
stable
as $$
  select
    p.id,
    p.product_name,
    p.category,
    p.description,
    1 - (p.embedding <=> query_embedding) as similarity
  from public.ch_pp_products p
  where p.embedding is not null
  order by p.embedding <=> query_embedding
  limit match_count;
$$;
