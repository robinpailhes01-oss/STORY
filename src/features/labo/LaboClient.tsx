"use client";

import dynamic from "next/dynamic";

// Konva touche à window/document : le laboratoire n’est jamais rendu côté serveur.
const Labo = dynamic(() => import("./Labo"), {
  ssr: false,
  loading: () => <p className="text-sm text-nuit/70">Chargement du moteur de rendu…</p>,
});

export function LaboClient() {
  return <Labo />;
}
