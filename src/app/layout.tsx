import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Market Twin — AI Launch Simulation",
    template: "%s · Market Twin",
  },
  description:
    "Validate market reaction before you launch — with AI personas grounded in government statistics across 24 countries.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        {/*
         * Pretendard variable web font — loaded via <link> (more reliable
         * than CSS @import inside Tailwind v4 entry, which got stripped /
         * not applied in earlier attempts). Pre-connect to jsDelivr first
         * so the TLS handshake doesn't gate the stylesheet.
         */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css"
        />
        {/*
         * Noto Sans CJK (Simplified + Traditional Chinese) from Google
         * Fonts — Pretendard ships Korean + Latin only, so Chinese
         * brand names (誠品, 蝦皮台灣, momo購物 etc.) emitted by the
         * market-profile LLM render as broken glyphs / accent-fallback
         * artifacts on Windows without the Microsoft CJK fonts. Loading
         * Noto SC + TC via Google Fonts guarantees coverage on every
         * platform without requiring user-side font installs.
         *
         * Display: swap. The previous `optional` setting meant the
         * browser gave up on the font after ~100ms and stuck with the
         * Pretendard fallback for the rest of the page lifetime — on
         * Windows machines without a system CJK font, that left every
         * Chinese character rendering as tofu / garbled glyphs even
         * after the Noto font had finished downloading. `swap` shows
         * the fallback briefly then swaps in the real font when it
         * arrives, on every page load.
         */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- Noto CJK loaded here intentionally: next/font has no Noto SC/TC variable-weight support and this root layout covers all routes */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&family=Noto+Sans+TC:wght@400;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
