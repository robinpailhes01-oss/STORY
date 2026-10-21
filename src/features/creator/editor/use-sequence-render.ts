"use client";

import { useEffect, useMemo, useState } from "react";
import { composeSequence, fontRequirementsForSequence, type ComposeResult, type PhotoRef } from "@/lib/compose";
import { loadFonts } from "@/lib/fonts/load-fonts";
import { layoutDocument, type DocumentLayout } from "@/lib/layout/document-layout";
import type { ImportedPhoto } from "@/lib/photos";
import type { ImageTable } from "@/features/renderer/images";
import { DEFAULT_CROP, type Snapshot } from "../model/draft";

export const DOCUMENT_ID = "story";

export interface SequenceRender {
  /** Composition affichée (style courant, ou le précédent tant que les polices du nouveau chargent). */
  composition: ComposeResult | null;
  layout: DocumentLayout | null;
  images: ImageTable;
  /** Style réellement dessiné. */
  shownStyleId: string | null;
  /** Polices du texte et du style courants chargées et contrôlées. */
  fontsReady: boolean;
  /** Glyphe absent, police introuvable… (bloque l’export). */
  fontError: string | null;
  requirements: ReturnType<typeof fontRequirementsForSequence>;
}

/**
 * Polices → composition → mise en page, recalculées à chaque changement de texte, de style, d’option, de dessin
 * ou de photo.
 * Références stables (composition, layout, images) : StoryPreview est mémoïsé.
 */
export function useSequenceRender(snapshot: Snapshot, pool: ReadonlyMap<string, ImportedPhoto>): SequenceRender {
  const { plan, styleId, photos, crops, options, drawings } = snapshot;
  const requirements = useMemo(() => (plan ? fontRequirementsForSequence(plan, styleId) : []), [plan, styleId]);
  const requirementsKey = useMemo(() => JSON.stringify(requirements), [requirements]);
  const [fontStatus, setFontStatus] = useState<{ key: string; error: string | null } | null>(null);
  const [loadedStyles, setLoadedStyles] = useState<string[]>([]);
  const [fontsVersion, setFontsVersion] = useState(0);

  useEffect(() => {
    if (!requirements.length) return;
    let cancelled = false;
    const done = (error: string | null) => {
      if (cancelled) return;
      setFontStatus({ key: requirementsKey, error });
      setLoadedStyles((s) => (s.includes(styleId) ? s : [...s, styleId]));
    };
    loadFonts(requirements).then(
      () => done(null),
      (error: unknown) => done(error instanceof Error ? error.message : String(error)),
    );
    return () => {
      cancelled = true;
    };
    // requirementsKey résume requirements : relancer seulement quand le texte ou le style changent vraiment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirementsKey, styleId]);

  // Une police arrivée plus tard (sous-ensemble latin-ext…) : remesurer.
  useEffect(() => {
    const onLoaded = () => setFontsVersion((v) => v + 1);
    document.fonts.addEventListener("loadingdone", onLoaded);
    return () => document.fonts.removeEventListener("loadingdone", onLoaded);
  }, []);

  const shownStyleId = loadedStyles.includes(styleId) ? styleId : (loadedStyles.at(-1) ?? null);

  const photosKey = photos.join("|");
  const photoRefs = useMemo<Array<PhotoRef | null>>(
    () => photos.map((id) => (id ? { assetId: id, ...(crops[id] ?? DEFAULT_CROP) } : null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [photosKey, crops],
  );

  const images = useMemo<ImageTable>(() => {
    const table = new Map<string, CanvasImageSource>();
    for (const id of photosKey.split("|")) {
      const photo = id ? pool.get(id) : undefined;
      if (photo) table.set(id, photo.image);
    }
    return table;
  }, [photosKey, pool]);

  const composition = useMemo(() => {
    void fontsVersion; // dépendance volontaire : remesurer après chaque chargement de police
    if (!plan || !shownStyleId) return null;
    return composeSequence({ plan, styleId: shownStyleId, photos: photoRefs, options, drawings, documentId: DOCUMENT_ID });
  }, [plan, shownStyleId, photoRefs, options, drawings, fontsVersion]);

  const layout = useMemo(() => (composition ? layoutDocument(composition.document) : null), [composition]);

  const current = fontStatus?.key === requirementsKey ? fontStatus : null;
  return {
    composition,
    layout,
    images,
    shownStyleId,
    fontsReady: !!current && current.error === null && shownStyleId === styleId,
    fontError: current?.error ?? null,
    requirements,
  };
}
