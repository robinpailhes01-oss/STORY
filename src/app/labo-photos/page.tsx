import type { Metadata } from "next";
import { LaboPhotosClient } from "@/features/labo-photos/LaboPhotosClient";

export const metadata: Metadata = {
  title: "STORY · Labo photos",
  description: "Page de test de l’import des photos : formats, orientation, réduction, brouillon local",
};

export default function LaboPhotosPage() {
  return (
    <main className="mx-auto flex w-full max-w-[960px] flex-1 flex-col gap-6 px-4 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <p className="text-sm font-extrabold tracking-[0.24em]">STORY</p>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-nuit/60">Labo · import des photos</p>
      </header>
      <LaboPhotosClient />
    </main>
  );
}
