"use client";

import { useMemo, useState } from "react";
import { downloadBlob } from "@/lib/export/download";
import type { ExportedPng } from "@/lib/export/png";
import { zipPngs } from "@/lib/export/zip";
import { IconDownload, IconShare } from "../ui/icons";
import { Sheet } from "../ui/Sheet";

export type ExportState =
  | { status: "running"; done: number; total: number }
  | { status: "done"; files: ExportedPng[]; urls: string[]; zipName: string }
  | { status: "error"; message: string };

/** Feuille d’export : progression, puis les 5 images, partage (iPhone : « Enregistrer les images ») ou téléchargement. */
export function ExportSheet({ state, onClose }: { state: ExportState; onClose: () => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);

  const shareFiles = useMemo(() => {
    if (state.status !== "done" || typeof navigator === "undefined" || typeof File === "undefined") return null;
    const files = state.files.map((f) => new File([f.blob], f.fileName, { type: "image/png" }));
    try {
      return typeof navigator.canShare === "function" && typeof navigator.share === "function" && navigator.canShare({ files }) ? files : null;
    } catch {
      return null;
    }
  }, [state]);

  const share = async () => {
    if (!shareFiles) return;
    setMessage(null);
    try {
      await navigator.share({ files: shareFiles });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return; // partage fermé
      setMessage("Le partage n’a pas pu s’ouvrir. Télécharge les images ci-dessous.");
    }
  };

  const zip = async () => {
    if (state.status !== "done") return;
    setZipping(true);
    setMessage(null);
    try {
      downloadBlob(await zipPngs(state.files), state.zipName);
    } catch {
      setMessage("Le ZIP n’a pas pu être préparé. Télécharge les images une par une.");
    } finally {
      setZipping(false);
    }
  };

  const running = state.status === "running";
  return (
    <Sheet
      title={state.status === "done" ? "Tes 5 stories sont prêtes" : state.status === "error" ? "Export interrompu" : "Export en cours"}
      subtitle={state.status === "done" ? "PNG 1080 × 1920, dans l’ordre de publication." : undefined}
      onClose={onClose}
      locked={running}
      testId="export"
    >
      {state.status === "running" && (
        <div className="flex flex-col gap-3 py-2" aria-live="polite">
          <p className="text-sm text-soft">
            Story {Math.min(state.done + 1, state.total)} sur {state.total}…
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Export" aria-valuemin={0} aria-valuemax={state.total} aria-valuenow={state.done}>
            <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${(state.done / state.total) * 100}%` }} />
          </div>
        </div>
      )}

      {state.status === "error" && (
        <p role="alert" className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
          {state.message}
        </p>
      )}

      {state.status === "done" && (
        <div className="flex flex-col gap-4">
          <ol className="grid grid-cols-5 gap-2">
            {state.files.map((f, i) => (
              <li key={f.fileName} className="flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- image locale (object URL) */}
                <img src={state.urls[i]} alt={`Story ${i + 1} exportée`} className="aspect-[9/16] w-full rounded-lg object-cover ring-1 ring-white/15" />
                <span className="text-[11px] font-bold text-mute">{i + 1}</span>
              </li>
            ))}
          </ol>

          {shareFiles && (
            <div className="flex flex-col gap-1.5">
              <button type="button" data-autofocus className="btn-chrome w-full" onClick={share} data-action="partager">
                <IconShare size={20} /> Enregistrer dans Photos / Partager
              </button>
              <p className="text-center text-xs text-mute">Sur iPhone, choisis « Enregistrer les images ».</p>
            </div>
          )}

          <div className={shareFiles ? "flex flex-col gap-2 border-t border-white/8 pt-4" : "flex flex-col gap-2"}>
            {shareFiles && <p className="text-xs font-bold text-mute">Ou télécharge les fichiers :</p>}
            <button
              type="button"
              data-autofocus={shareFiles ? undefined : true}
              className={shareFiles ? "btn-ghost w-full" : "btn-chrome w-full"}
              onClick={zip}
              disabled={zipping}
              data-download="zip"
            >
              <IconDownload size={20} /> {zipping ? "Préparation du ZIP…" : "Télécharger le ZIP"}
            </button>
            <div className="grid grid-cols-5 gap-2">
              {state.files.map((f, i) => (
                <button
                  key={f.fileName}
                  type="button"
                  className="btn-ghost min-h-11 px-0 text-xs"
                  onClick={() => downloadBlob(f.blob, f.fileName)}
                  data-download={`png-${i + 1}`}
                  aria-label={`Télécharger la story ${i + 1} (PNG)`}
                >
                  PNG {i + 1}
                </button>
              ))}
            </div>
          </div>
          {message && (
            <p role="alert" className="text-sm text-red-200">
              {message}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
