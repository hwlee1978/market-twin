import sharp from "sharp";

/**
 * Post-production logo compositor.
 *
 * gpt-image-1 is unreliable at rendering text — it hallucinates garbled
 * brand marks ("Lachiisoan", "Bredisn") and incidental letterforms.
 * Strategy: ask the AI for a clean unbranded product image, then
 * composite the workspace's actual logo PNG over it programmatically.
 * Result: 0% chance of garbled brand text.
 *
 * Position presets (default bottom-right) — works as both a watermark
 * for casual posts AND a corner brand mark for hero shots. For
 * shoe-tongue or center-product placement, future work needs a vision
 * pass to detect the product surface.
 */

export type CompositePosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

export type CompositeOptions = {
  position?: CompositePosition;
  size_pct?: number;     // 0-100, logo width as % of base image width (default 12)
  opacity?: number;       // 0-1 (default 1.0 — fully visible)
  padding_pct?: number;  // 0-100, padding from edge as % of base image width (default 4)
  with_backdrop?: boolean; // soft white/dark rounded rectangle behind logo for readability
};

export async function compositeLogoOnImage(
  baseImage: Buffer,
  logoSource: { url?: string; buffer?: Buffer },
  opts: CompositeOptions = {},
): Promise<Buffer> {
  const position = opts.position ?? "bottom-right";
  const sizePct = opts.size_pct ?? 12;
  const opacity = Math.max(0, Math.min(1, opts.opacity ?? 1.0));
  const paddingPct = opts.padding_pct ?? 4;
  const withBackdrop = opts.with_backdrop ?? false;

  // Fetch logo if URL provided
  let logoBuf: Buffer;
  if (logoSource.buffer) {
    logoBuf = logoSource.buffer;
  } else if (logoSource.url) {
    const res = await fetch(logoSource.url);
    if (!res.ok) throw new Error(`logo fetch failed: ${res.status}`);
    logoBuf = Buffer.from(await res.arrayBuffer());
  } else {
    throw new Error("composite-logo: must provide logoSource.url or .buffer");
  }

  // Base dimensions
  const baseMeta = await sharp(baseImage).metadata();
  const baseW = baseMeta.width ?? 1024;
  const baseH = baseMeta.height ?? 1024;

  // Resize logo + ensure RGBA. For partial opacity multiply alpha channel.
  const targetLogoW = Math.max(60, Math.round((baseW * sizePct) / 100));
  let logoPipeline = sharp(logoBuf)
    .ensureAlpha()
    .resize(targetLogoW, null, {
      fit: "inside",
      withoutEnlargement: false,
    });

  // Multiply alpha by opacity when < 1.0
  if (opacity < 0.99) {
    logoPipeline = logoPipeline.composite([
      {
        input: Buffer.from([255, 255, 255, Math.round(opacity * 255)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: "dest-in",
      },
    ]);
  }

  const resizedLogo = await logoPipeline.png().toBuffer();
  const logoMeta = await sharp(resizedLogo).metadata();
  const logoW = logoMeta.width ?? targetLogoW;
  const logoH = logoMeta.height ?? targetLogoW;

  // Position
  const pad = Math.round((baseW * paddingPct) / 100);
  let top: number;
  let left: number;
  switch (position) {
    case "top-left":
      top = pad;
      left = pad;
      break;
    case "top-right":
      top = pad;
      left = baseW - logoW - pad;
      break;
    case "bottom-left":
      top = baseH - logoH - pad;
      left = pad;
      break;
    case "center":
      top = Math.round((baseH - logoH) / 2);
      left = Math.round((baseW - logoW) / 2);
      break;
    case "bottom-right":
    default:
      top = baseH - logoH - pad;
      left = baseW - logoW - pad;
      break;
  }

  // Optional backdrop — soft rounded rectangle behind logo for legibility
  // on busy backgrounds. Use a white-translucent pad scaled to the logo.
  const overlays: sharp.OverlayOptions[] = [];
  if (withBackdrop) {
    const padX = Math.round(logoW * 0.15);
    const padY = Math.round(logoH * 0.25);
    const bgW = logoW + padX * 2;
    const bgH = logoH + padY * 2;
    const radius = Math.round(Math.min(bgW, bgH) * 0.18);
    const svg = `<svg width="${bgW}" height="${bgH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${bgW}" height="${bgH}" rx="${radius}" ry="${radius}" fill="white" fill-opacity="0.82" />
    </svg>`;
    const bgBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    overlays.push({
      input: bgBuffer,
      top: top - padY,
      left: left - padX,
    });
  }
  overlays.push({ input: resizedLogo, top, left });

  return sharp(baseImage).composite(overlays).png().toBuffer();
}
