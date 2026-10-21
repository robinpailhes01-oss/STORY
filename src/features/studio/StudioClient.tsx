"use client";

import dynamic from "next/dynamic";

// Konva touche à window/document : le studio n’est jamais rendu côté serveur.
const Studio = dynamic(() => import("./Studio"), {
  ssr: false,
  loading: () => <p className="text-sm text-nuit/70">Chargement du moteur de rendu…</p>,
});

export function StudioClient() {
  return <Studio />;
}
