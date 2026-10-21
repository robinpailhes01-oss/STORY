"use client";

import dynamic from "next/dynamic";

// Konva, IndexedDB et localStorage n’existent que dans le navigateur : la page n’est jamais rendue côté serveur.
const Creator = dynamic(() => import("./Creator"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4" role="status">
      <span className="block size-8 animate-spin rounded-full border-2 border-white/80 border-t-transparent" aria-hidden />
      <p className="text-sm text-[#9198a6]">Chargement…</p>
    </div>
  ),
});

export function CreatorClient() {
  return <Creator />;
}
