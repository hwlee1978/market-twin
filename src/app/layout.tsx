import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Market Twin — AI Launch Simulation",
    template: "%s · Market Twin",
  },
  description:
    "Validate market reaction before you launch — with AI personas grounded in government statistics across 20 countries.",
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
      </head>
      <body>{children}</body>
    </html>
  );
}
