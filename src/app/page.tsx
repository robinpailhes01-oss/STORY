import type { Metadata, Viewport } from "next";
import { CreatorClient } from "@/features/creator/CreatorClient";

export const metadata: Metadata = {
  title: "STORY · 5 stories à partir de 3 photos et une idée",
  description: "Écris ton idée, ajoute 3 photos : l’IA écrit 5 stories, tu choisis le style, tu ajustes et tu exportes.",
};

export const viewport: Viewport = {
  themeColor: "#0a0c12",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function Home() {
  return (
    <div className="creator-root flex min-h-dvh flex-1 flex-col">
      <CreatorClient />
    </div>
  );
}
