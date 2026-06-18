-- ensembles.locale (2026-06-18)
--
-- The Cloud Run worker reconstructs orchestration context from ensembleId
-- alone (loadOrchestrationContext), but the user's language was never stored
-- on the ensemble row — so the narrative/hot-take generation locale was
-- hardcoded to Korean, and English users got Korean results. Persist the
-- request locale here so the worker generates in the correct language.

ALTER TABLE ensembles
  ADD COLUMN locale TEXT NOT NULL DEFAULT 'ko'
  CHECK (locale IN ('ko', 'en'));

COMMENT ON COLUMN ensembles.locale IS
  'User language at run time (ko|en). Drives narrative/hot-take generation language in the orchestrator worker.';
