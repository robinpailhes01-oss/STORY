import type { Metadata, Viewport } from "next";
import { CreatorClient } from "@/features/creator/CreatorClient";

export const metadata: Metadata = {
  title: "Story · 5 stories à partir de 2 ou 3 photos",
  description: "Ajoute 2 ou 3 photos, une idée si tu en as une : l’IA écrit 5 stories à partir de ton profil, tu choisis le style, tu ajustes et tu exportes.",
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
