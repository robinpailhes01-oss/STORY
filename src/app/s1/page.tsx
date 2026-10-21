import type { Metadata } from "next";
import { StudioClient } from "@/features/studio/StudioClient";

export const metadata: Metadata = {
  title: "STORY · Studio S1",
  description: "Studio S1 : rendu et export 1080 × 1920 du document Luma",
};

export default function StudioS1Page() {
  return (
    <main className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-10 px-4 py-8 sm:px-8">
      <header className="flex items-center justify-between">
        <p className="text-sm font-extrabold tracking-[0.24em]">STORY</p>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-nuit/60">Luma · rendu et export</p>
      </header>
      <StudioClient />
    </main>
  );
}
