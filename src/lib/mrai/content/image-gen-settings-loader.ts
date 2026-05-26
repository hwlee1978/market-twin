import { createServiceClient } from "@/lib/supabase/server";
import type { ImageGenSettings } from "./image-gen";

/**
 * Server-side loader for workspace image-gen settings. Returns null
 * when the workspace has no custom settings row (caller falls back to
 * library defaults). Used by all server routes that invoke
 * generateImagesForDraft.
 */
export async function loadImageGenSettings(
  workspaceId: string,
): Promise<Partial<ImageGenSettings> | null> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("mrai_image_gen_settings")
    .select(
      "logo_position, logo_size_pct, logo_padding_pct, logo_opacity, logo_with_backdrop, logo_composite_enabled, logo_placement_mode, use_library_photo_as_base, prompt_strictness, quality",
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data) return null;
  return data as Partial<ImageGenSettings>;
}
