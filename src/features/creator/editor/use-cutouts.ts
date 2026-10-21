"use client";

import { useEffect, useMemo, useState } from "react";
import type { ImageTable } from "@/features/renderer/images";
import type { ImportedPhoto } from "@/lib/photos";
import { MIN_SUBJECT_COVERAGE, getCutout, isSegmentationError } from "@/lib/segmentation";
import { getStyle } from "@/styles/presets";

type CutoutEntry =
  | { status: "ok"; cutout: HTMLCanvasElement; coverage: number }
  | { status: "aucune-personne"; coverage: number }
  | { status: "erreur"; message: string };

export interface CutoutsState {
  /** Le style courant a un mot géant derrière la personne. */
  needed: boolean;
  /** Détourages utilisables (assetId → découpe), seulement si `needed`. */
  table: ImageTable;
  /** Un détourage est en cours de calcul. */
  computing: boolean;
  /** Photos sans détourage (aucune personne, erreur) : le mot reste devant. */
  warnings: string[];
}

const EMPTY: ImageTable = new Map();

/** Styles à mot géant derrière la personne (Géant, Théâtre…) : ils ont besoin du détourage. */
export function styleNeedsCutout(styleId: string): boolean {
  try {
    return !!getStyle(styleId).giant;
  } catch {
    return false;
  }
}

/**
 * Détourage des photos de la séquence, calculé à la demande (style à mot géant choisi), une fois par photo
 * (cache de @/lib/segmentation). Sous MIN_SUBJECT_COVERAGE ou en erreur : avertissement, le mot reste devant.
 */
export function useCutouts(styleId: string, photos: ReadonlyArray<string | null>, pool: ReadonlyMap<string, ImportedPhoto>): CutoutsState {
  const needed = styleNeedsCutout(styleId);
  const [entries, setEntries] = useState<ReadonlyMap<string, CutoutEntry>>(new Map());
  const ids = useMemo(() => photos.filter((id): id is string => !!id), [photos]);
  const idsKey = ids.join("|");

  useEffect(() => {
    if (!needed) return;
    let cancelled = false;
    for (const id of idsKey.split("|").filter(Boolean)) {
      const photo = pool.get(id);
      if (!photo || entries.has(id)) continue;
      getCutout(id, photo.image).then(
        (result) => {
          if (cancelled) return;
          const entry: CutoutEntry =
            result.coverage >= MIN_SUBJECT_COVERAGE ? { status: "ok", cutout: result.cutout, coverage: result.coverage } : { status: "aucune-personne", coverage: result.coverage };
          setEntries((m) => new Map(m).set(id, entry));
        },
        (error: unknown) => {
          if (cancelled) return;
          const message = isSegmentationError(error) ? error.message : "le calcul n’a pas abouti";
          setEntries((m) => new Map(m).set(id, { status: "erreur", message }));
        },
      );
    }
    return () => {
      cancelled = true;
    };
  }, [needed, idsKey, pool, entries]);

  return useMemo(() => {
    if (!needed) return { needed, table: EMPTY, computing: false, warnings: [] };
    const table = new Map<string, CanvasImageSource>();
    const warnings: string[] = [];
    let computing = false;
    photos.forEach((id, slot) => {
      if (!id) return;
      const entry = entries.get(id);
      if (!entry) computing = true;
      else if (entry.status === "ok") table.set(id, entry.cutout);
      else if (entry.status === "aucune-personne") warnings.push(`Photo ${slot + 1} : aucune personne détectée, le mot géant reste devant.`);
      else warnings.push(`Photo ${slot + 1} : détourage impossible (${entry.message.replace(/\.$/, "")}), le mot géant reste devant.`);
    });
    return { needed, table, computing, warnings };
  }, [needed, photos, entries]);
}
