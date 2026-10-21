"use client";

import dynamic from "next/dynamic";

// Canvas, Konva et MediaPipe : jamais rendus côté serveur.
const LaboDetourage = dynamic(() => import("./LaboDetourage"), {
  ssr: false,
  loading: () => <p className="text-sm text-nuit/70">Chargement du labo…</p>,
});

export function LaboDetourageClient() {
  return <LaboDetourage />;
}
