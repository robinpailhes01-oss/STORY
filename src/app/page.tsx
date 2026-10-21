import { StudioClient } from "@/features/studio/StudioClient";

export default function Home() {
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
