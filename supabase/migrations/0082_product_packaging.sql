-- 0082_product_packaging.sql
-- Product packaging spec on projects (2026-08).
--
-- Until now the engine only knew base_price_cents, so a 30ml and a 100ml
-- bottle at the same price were indistinguishable to every persona and every
-- competitor comparison. This column carries the retail pack spec so prompts
-- can render a per-unit price (per 100ml / per sheet).
--
-- jsonb rather than five columns: the blob is only ever read as a whole by
-- ProjectInput.packaging, and the shape is validated in code (zod on write,
-- parsePackaging() on read).
--
-- Shape: {
--   netContent:     number  -- content of ONE unit, e.g. 100 (ml) or 25 (ml/sheet)
--   netContentUnit: text    -- ml | L | g | kg | fl_oz | oz | lb | piece | sheet | serving
--   unitsPerPack:   int     -- units in one retail pack (5 for a 5-sheet mask box)
--   packFormat:     text    -- free text, <=60 chars: "유리 스프레이 보틀"
--   caseQty:        int     -- packs per wholesale shipping case
-- }
-- NULL for every legacy project; prompts fall back to the old price-only block.

alter table public.projects
  add column if not exists packaging jsonb;

comment on column public.projects.packaging is
  'Retail pack spec (net content, units per pack, format). base_price_cents is the price of ONE pack. Validated by parsePackaging() on read.';

-- Guard the blob at the DB edge too: object-shaped or nothing. Keeps a
-- stray array / scalar from a script or manual edit out of the engine.
alter table public.projects
  drop constraint if exists projects_packaging_is_object;
alter table public.projects
  add constraint projects_packaging_is_object
  check (packaging is null or jsonb_typeof(packaging) = 'object');
