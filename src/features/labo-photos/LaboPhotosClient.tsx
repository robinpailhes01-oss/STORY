"use client";

import dynamic from "next/dynamic";

// L’import touche à document, canvas et IndexedDB : jamais rendu côté serveur.
const LaboPhotos = dynamic(() => import("./LaboPhotos"), {
  ssr: false,
  loading: () => <p className="text-sm text-nuit/70">Chargement du labo…</p>,
});

export function LaboPhotosClient() {
  return <LaboPhotos />;
}
