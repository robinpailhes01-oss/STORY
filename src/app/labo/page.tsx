import type { Metadata } from "next";
import { LaboClient } from "@/features/labo/LaboClient";

export const metadata: Metadata = {
  title: "STORY · Laboratoire",
  description: "Moteur visuel : la séquence d’exemple dans chaque style, contraste et export",
};

export default function LaboPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-10 px-4 py-8 sm:px-8">
      <header className="flex items-center justify-between">
        <p className="text-sm font-extrabold tracking-[0.24em]">STORY</p>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-nuit/60">Laboratoire · moteur visuel</p>
      </header>
      <LaboClient />
    </main>
  );
}
