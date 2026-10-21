"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deletePhotos,
  getOrientationSupport,
  importPhotos,
  loadPhotos,
  releasePhoto,
  savePhotos,
  type ImportedPhoto,
  type OrientationSupport,
  type PhotoImportResult,
} from "@/lib/photos";
import {
  entryReport,
  inspectPhotoBytes,
  resultReport,
  samplePhoto,
  sniffNumbers,
  type LabDraftState,
  type LabEntry,
} from "./lab-report";

const DRAFT_ID = "labo-photos";

let keyCounter = 0;
const nextKey = () => `entree-${++keyCounter}`;

const toEntry = (r: PhotoImportResult): LabEntry =>
  r.ok
    ? { key: nextKey(), fileName: r.fileName, status: "ok", photo: r.photo, restored: false }
    : { key: nextKey(), fileName: r.fileName, status: "erreur", code: r.error.code, message: r.error.message };

const okPhotos = (entries: LabEntry[]): ImportedPhoto[] =>
  entries.flatMap((e) => (e.status === "ok" ? [e.photo] : []));

const formatBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} Mo` : `${Math.round(n / 1024)} Ko`;

export default function LaboPhotos() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [support, setSupport] = useState<OrientationSupport | null>(null);
  const [entries, setEntries] = useState<LabEntry[]>([]);
  const [manual, setManual] = useState(false);
  const [draft, setDraft] = useState<LabDraftState>({ available: null, message: null, last: "aucune", count: 0 });
  const entriesRef = useRef<LabEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const replaceEntries = useCallback((next: LabEntry[]) => {
    // Les photos qui disparaissent de la liste libèrent leur object URL.
    const kept = new Set(okPhotos(next));
    for (const photo of okPhotos(entriesRef.current)) if (!kept.has(photo)) releasePhoto(photo);
    entriesRef.current = next;
    setEntries(next);
  }, []);

  const appendEntry = useCallback((entry: LabEntry) => {
    entriesRef.current = [...entriesRef.current, entry];
    setEntries(entriesRef.current);
  }, []);

  const runImport = useCallback(
    async (files: Blob[], orientation: "auto" | "manuel") => {
      setBusy(true);
      try {
        return await importPhotos(files, { orientation }, (result) => appendEntry(toEntry(result)));
      } finally {
        setBusy(false);
      }
    },
    [appendEntry],
  );

  const restore = useCallback(async () => {
    const result = await loadPhotos(DRAFT_ID);
    replaceEntries(
      result.photos.map((photo) => ({ key: nextKey(), fileName: photo.name, status: "ok", photo, restored: true })),
    );
    setDraft({ available: result.available, message: result.message ?? null, last: "restauré", count: result.photos.length });
  }, [replaceEntries]);

  const save = useCallback(async () => {
    const photos = okPhotos(entriesRef.current);
    const result = await savePhotos(DRAFT_ID, photos);
    setDraft({
      available: result.available,
      message: result.message ?? null,
      last: result.saved ? "enregistré" : "aucune",
      count: result.count,
    });
  }, []);

  const clearDraft = useCallback(async () => {
    const result = await deletePhotos(DRAFT_ID);
    setDraft({ available: result.available, message: result.message ?? null, last: result.deleted ? "effacé" : "aucune", count: 0 });
  }, []);

  // Au chargement : capacités du navigateur, puis restauration du brouillon.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await getOrientationSupport();
      if (cancelled) return;
      setSupport(s);
      await restore();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [restore]);

  // Démontage : libération de toutes les photos.
  useEffect(() => () => okPhotos(entriesRef.current).forEach(releasePhoto), []);

  // Rapport pour la vérification automatique.
  useEffect(() => {
    const find = (id: string) => {
      const photo = okPhotos(entriesRef.current).find((p) => p.id === id);
      if (!photo) throw new Error(`photo ${id} absente`);
      return photo;
    };
    window.__photoLab = {
      ready,
      busy,
      support,
      entries: entries.map(entryReport),
      draft,
      importFiles: async (files, options) => (await runImport(files, options?.orientation ?? "auto")).map(resultReport),
      sample: (id, points) => samplePhoto(find(id), points),
      inspect: (id) => inspectPhotoBytes(find(id)),
      sniff: sniffNumbers,
      save,
      restore,
      clearDraft,
    };
  }, [ready, busy, support, entries, draft, runImport, save, restore, clearDraft]);

  const onFiles = async (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (inputRef.current) inputRef.current.value = "";
    if (files.length) await runImport(files, manual ? "manuel" : "auto");
  };

  const okCount = okPhotos(entries).length;

  return (
    <section
      className="flex flex-col gap-5"
      data-photo-lab={ready ? "ready" : "loading"}
      data-busy={busy ? "oui" : "non"}
    >
      <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <label
          htmlFor="photo-input"
          className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl bg-nuit px-4 text-sm font-bold text-creme"
        >
          {busy ? "Import en cours…" : "Ajouter des photos"}
        </label>
        <input
          id="photo-input"
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(e) => onFiles(e.currentTarget.files)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={manual} onChange={(e) => setManual(e.currentTarget.checked)} />
          Forcer la lecture EXIF manuelle (test du repli)
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={save} disabled={busy || !okCount} className="min-h-11 rounded-lg bg-accent px-2 text-xs font-bold disabled:opacity-40">
            Enregistrer le brouillon
          </button>
          <button type="button" onClick={restore} disabled={busy} className="min-h-11 rounded-lg bg-accent px-2 text-xs font-bold disabled:opacity-40">
            Restaurer
          </button>
          <button type="button" onClick={clearDraft} disabled={busy} className="min-h-11 rounded-lg bg-accent px-2 text-xs font-bold disabled:opacity-40">
            Effacer le brouillon
          </button>
        </div>
        <p className="text-xs text-nuit/70" data-draft-status>
          Brouillon :{" "}
          {draft.available === false
            ? "indisponible"
            : draft.last === "aucune"
              ? "—"
              : draft.count === 0 && draft.last !== "effacé"
                ? "vide"
              : `${draft.last} (${draft.count} photo${draft.count > 1 ? "s" : ""})`}
        </p>
        {draft.message && (
          <p role="status" className="rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900">
            {draft.message}
          </p>
        )}
        {support && (
          <p className="text-[11px] leading-snug text-nuit/60">
            Navigateur : createImageBitmap {support.bitmap ? "oui" : "non"} · orientation native{" "}
            {support.bitmapOriented || support.elementOriented ? "oui" : "non"} · réduction au décodage{" "}
            {support.bitmapResize ? "oui" : "non"}
          </p>
        )}
      </div>

      {entries.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {entries.map((entry) => (
            <li key={entry.key} className="flex flex-col gap-2 rounded-xl bg-white p-2 text-[11px] leading-snug shadow-sm">
              {entry.status === "ok" ? (
                <>
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-nuit/10">
                    {/* eslint-disable-next-line @next/next/no-img-element -- object URL locale, pas d’optimisation Next */}
                    <img src={entry.photo.url} alt={entry.fileName || "photo importée"} className="max-h-full max-w-full" />
                  </div>
                  <p className="truncate font-bold">{entry.fileName || "sans nom"}</p>
                  <p>
                    {entry.photo.width} × {entry.photo.height} · {formatBytes(entry.photo.blob.size)}
                  </p>
                  <p className="text-nuit/60">
                    {entry.photo.sourceType.replace("image/", "")} → jpeg · {entry.photo.diagnostics.decoder}
                    {entry.photo.diagnostics.exifOrientation !== 1 && ` · EXIF ${entry.photo.diagnostics.exifOrientation}`}
                    {!entry.restored && ` · ${entry.photo.diagnostics.durationMs} ms`}
                  </p>
                  {entry.photo.warnings.map((w) => (
                    <p key={w.code} className="rounded bg-amber-100 px-2 py-1 text-amber-900">
                      {w.message}
                    </p>
                  ))}
                </>
              ) : (
                <>
                  <p className="truncate font-bold">{entry.fileName || "sans nom"}</p>
                  <p role="alert" className="rounded bg-red-100 px-2 py-1 text-red-900">
                    {entry.message}
                  </p>
                  <p className="text-nuit/50">{entry.code}</p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
