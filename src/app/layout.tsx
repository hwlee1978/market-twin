import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Market Twin",
  description: "Predict product launch outcomes with AI consumer simulation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
