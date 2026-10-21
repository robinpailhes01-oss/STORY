import type { Metadata } from "next";
import { LaboDetourageClient } from "@/features/labo-detourage/LaboDetourageClient";

export const metadata: Metadata = {
  title: "STORY · Labo détourage",
  description: "Page de test du détourage de la personne : masque, découpe, mot géant derrière",
};

export default function LaboDetouragePage() {
  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-6 px-4 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <p className="text-sm font-extrabold tracking-[0.24em]">STORY</p>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-nuit/60">Labo · détourage de la personne</p>
      </header>
      <LaboDetourageClient />
    </main>
  );
}
