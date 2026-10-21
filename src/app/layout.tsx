import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "STORY · Luma",
  description: "Studio de stories : rendu et export 1080 × 1920",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
