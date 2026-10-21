"use client";

// Labo du détourage : on importe une photo (même chemin que l’application), on la détoure et on
// affiche l’original, le masque, la découpe sur damier, le détail des bords et un mot géant passé
// derrière la personne. Le script scripts/verify-segmentation.mjs pilote la page par window.__segLab.
import { useCallback, useEffect, useRef, useState } from "react";
import { importPhoto, releasePhoto, type ImportedPhoto } from "@/lib/photos";
import {
  MIN_SUBJECT_COVERAGE,
  SEGMENTATION_MODELS,
  cutoutSubject,
  disposeSegmenter,
  getCutout,
  isSegmentationError,
  peekCutout,
  preloadSegmenter,
  releaseAllCutouts,
  releaseCutout,
  type CutoutOptions,
  type CutoutResult,
  type SegmentationModel,
} from "@/lib/segmentation";
import GiantWordPreview, { GIANT_WORD_FONT } from "./GiantWordPreview";
import { alphaStats, drawChecker, drawEdgeZoom, drawMask, drawOriginal, edgeDetail, type AlphaStats } from "./panels";

const PANEL_W = 200;

type LabOptions = Omit<CutoutOptions, "signal">;

interface LabRun {
  key: string;
  name: string;
  photo: ImportedPhoto;
  options: LabOptions;
  result: CutoutResult | null;
  stats: AlphaStats | null;
  error: { code: string; message: string } | null;
}

/** Résumé renvoyé au script de vérification. */
export interface LabRunReport {
  name: string;
  ok: boolean;
  error?: { code: string; message: string };
  photoWidth: number;
  photoHeight: number;
  cutoutWidth?: number;
  cutoutHeight?: number;
  coverage?: number;
  ms?: number;
  timings?: CutoutResult["timings"];
  delegate?: string;
  model?: string;
  maskWidth?: number;
  maskHeight?: number;
  islandsRemoved?: number;
  zoomRegion?: CutoutResult["zoomRegion"];
  alpha?: Omit<AlphaStats, "box">;
}

interface SegLab {
  ready: boolean;
  busy: boolean;
  preload(model?: SegmentationModel, delegate?: CutoutOptions["delegate"]): Promise<{ ok: boolean; ms: number; message?: string }>;
  run(name: string, dataUrl: string, options?: LabOptions): Promise<LabRunReport>;
  /** Détail des bords à pleine définition (PNG), pour juger la qualité. */
  detail(name: string): string | null;
  cacheCheck(dataUrl: string): Promise<{ samePromise: boolean; sameCanvas: boolean; cachedMs: number; released: boolean }>;
  clear(): void;
  /** Ferme les segmenteurs (libère wasm et mémoire). */
  dispose(): Promise<void>;
}

declare global {
  interface Window {
    __segLab?: SegLab;
  }
}

let keyCounter = 0;

function report(run: LabRun): LabRunReport {
  const base = { name: run.name, photoWidth: run.photo.width, photoHeight: run.photo.height };
  if (!run.result) return { ...base, ok: false, error: run.error ?? { code: "inconnu", message: "pas de résultat" } };
  const { cutout, coverage, ms, timings, delegate, model, maskWidth, maskHeight, islandsRemoved, zoomRegion } = run.result;
  const alpha = run.stats ? { transparent: run.stats.transparent, opaque: run.stats.opaque, partial: run.stats.partial } : undefined;
  return {
    ...base,
    ok: true,
    cutoutWidth: cutout.width,
    cutoutHeight: cutout.height,
    coverage,
    ms,
    timings,
    delegate,
    model,
    maskWidth,
    maskHeight,
    islandsRemoved,
    zoomRegion,
    alpha,
  };
}

const pct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")} %`;
const msTxt = (v: number) => `${Math.round(v)} ms`;

export default function LaboDetourage() {
  const [runs, setRuns] = useState<LabRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<SegmentationModel>("selfie");
  const [refine, setRefine] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [fontReady, setFontReady] = useState(false);
  const runsRef = useRef<LabRun[]>([]);

  const runOne = useCallback(async (name: string, blob: Blob, options: LabOptions) => {
    const photo = await importPhoto(blob);
    const run: LabRun = { key: `run-${++keyCounter}`, name, photo, options, result: null, stats: null, error: null };
    try {
      run.result = await cutoutSubject(photo.image, options);
      run.stats = alphaStats(run.result.cutout);
    } catch (error) {
      run.error = isSegmentationError(error)
        ? { code: error.code, message: error.message }
        : { code: "inattendu", message: error instanceof Error ? error.message : String(error) };
      console.error("Détourage :", error);
    }
    runsRef.current = [...runsRef.current, run];
    setRuns(runsRef.current);
    return run;
  }, []);

  const clear = useCallback(() => {
    for (const run of runsRef.current) releasePhoto(run.photo);
    runsRef.current = [];
    setRuns([]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    document.fonts
      .load(`800 100px ${GIANT_WORD_FONT}`, "CALME")
      .then(() => !cancelled && setFontReady(true))
      .catch(() => !cancelled && setNotice("Police du mot géant indisponible : rendu avec la police de secours."));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const lab: SegLab = {
      ready: true,
      busy: false,
      async preload(m = "selfie", delegate) {
        const t0 = performance.now();
        try {
          await preloadSegmenter(m, delegate);
          return { ok: true, ms: performance.now() - t0 };
        } catch (error) {
          return { ok: false, ms: performance.now() - t0, message: error instanceof Error ? error.message : String(error) };
        }
      },
      async run(name, dataUrl, options = {}) {
        lab.busy = true;
        try {
          const blob = await (await fetch(dataUrl)).blob();
          const run = await runOne(name, blob, options);
          return report(run);
        } finally {
          lab.busy = false;
        }
      },
      detail(name) {
        const run = runsRef.current.find((r) => r.name === name);
        return run?.result ? edgeDetail(run.result.cutout, run.stats?.box ?? null) : null;
      },
      async cacheCheck(dataUrl) {
        const blob = await (await fetch(dataUrl)).blob();
        const photo = await importPhoto(blob, { id: "cache-test" });
        try {
          const first = getCutout(photo.id, photo.image);
          const second = getCutout(photo.id, photo.image);
          const [a, b] = await Promise.all([first, second]);
          const t0 = performance.now();
          const third = await getCutout(photo.id, photo.image);
          const cachedMs = performance.now() - t0;
          const sameCanvas = a.cutout === b.cutout && b.cutout === third.cutout && peekCutout(photo.id) === a;
          releaseCutout(photo.id);
          return { samePromise: first === second, sameCanvas, cachedMs, released: peekCutout(photo.id) === null && a.cutout.width === 0 };
        } finally {
          releasePhoto(photo);
        }
      },
      clear,
      dispose: disposeSegmenter,
    };
    window.__segLab = lab;
    return () => {
      delete window.__segLab;
    };
  }, [runOne, clear]);

  useEffect(
    () => () => {
      for (const run of runsRef.current) releasePhoto(run.photo);
      releaseAllCutouts();
    },
    [],
  );

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setNotice(null);
    try {
      for (const file of Array.from(files)) {
        try {
          await runOne(file.name, file, { model, refine });
        } catch (error) {
          setNotice(error instanceof Error ? error.message : String(error));
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5" data-seg-lab="ready">
      <section className="flex flex-col gap-3 rounded-2xl bg-white/70 p-4 shadow-sm">
        <label className="flex flex-col gap-2 text-sm font-bold">
          Photo(s) à détourer
          <input
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            disabled={busy}
            onChange={(e) => {
              void onFiles(e.currentTarget.files);
              e.currentTarget.value = "";
            }}
            className="text-sm font-normal"
          />
        </label>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            Modèle
            <select
              value={model}
              onChange={(e) => setModel(e.currentTarget.value as SegmentationModel)}
              className="rounded-lg border border-nuit/20 bg-white px-2 py-1"
            >
              {(Object.keys(SEGMENTATION_MODELS) as SegmentationModel[]).map((m) => (
                <option key={m} value={m}>
                  {m} ({Math.round(SEGMENTATION_MODELS[m].bytes / 1024).toLocaleString("fr-FR")} Ko)
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={refine} onChange={(e) => setRefine(e.currentTarget.checked)} />
            Recaler les bords sur la photo
          </label>
          {runs.length > 0 && (
            <button type="button" onClick={clear} className="rounded-full border border-nuit/30 px-3 py-1 font-bold">
              Vider
            </button>
          )}
        </div>
        {busy && <p className="text-sm text-nuit/70">Détourage en cours…</p>}
        {notice && <p className="text-sm font-bold text-red-700">{notice}</p>}
      </section>

      <ul className="flex flex-col gap-4" data-seg-results>
        {runs.map((run) => (
          <RunRow key={run.key} run={run} fontReady={fontReady} />
        ))}
      </ul>
    </div>
  );
}

function RunRow({ run, fontReady }: { run: LabRun; fontReady: boolean }) {
  const original = useRef<HTMLCanvasElement>(null);
  const mask = useRef<HTMLCanvasElement>(null);
  const checker = useRef<HTMLCanvasElement>(null);
  const zoom = useRef<HTMLCanvasElement>(null);
  const width = PANEL_W;
  const height = Math.round((PANEL_W * run.photo.height) / run.photo.width);
  const { result, stats } = run;

  useEffect(() => {
    if (original.current) drawOriginal(original.current, run.photo.image, width, height);
    if (!result) return;
    if (mask.current) drawMask(mask.current, result.cutout, width, height);
    if (checker.current) drawChecker(checker.current, result.cutout, width, height);
    if (zoom.current) drawEdgeZoom(zoom.current, result.cutout, stats?.box ?? null, width, height);
  }, [run, result, stats, width, height]);

  const noSubject = result !== null && result.coverage < MIN_SUBJECT_COVERAGE;
  return (
    <li className="flex flex-col gap-2 rounded-2xl bg-white/70 p-3 shadow-sm" data-seg-run={run.name}>
      <p className="text-sm">
        <b>{run.name}</b> · {run.photo.width} × {run.photo.height} · {run.result?.model ?? run.options.model ?? "selfie"}
        {run.options.refine === false ? " · sans recalage" : ""}
        {run.options.zoom === false ? " · sans zoom" : ""}
        {result && (
          <>
            {" "}
            · personne {pct(result.coverage)} · {msTxt(result.ms)} (chargement {msTxt(result.timings.load)}, modèle{" "}
            {msTxt(result.timings.segment)}, masque {msTxt(result.timings.refine)}, alpha {msTxt(result.timings.compose)}) ·{" "}
            {result.delegate}
            {result.zoomRegion ? " · 2ᵉ passage recadré" : ""}
            {result.islandsRemoved > 0 ? ` · ${result.islandsRemoved} îlot(s) retiré(s)` : ""}
          </>
        )}
      </p>
      {run.error && (
        <p className="text-sm font-bold text-red-700">
          {run.error.message} <span className="font-normal">({run.error.code})</span>
        </p>
      )}
      {noSubject && <p className="text-sm font-bold text-amber-700">Aucune personne détectée sur cette photo.</p>}
      <div className="flex flex-wrap gap-2">
        <Panel label="Original">
          <canvas ref={original} />
        </Panel>
        {result && (
          <>
            <Panel label="Masque">
              <canvas ref={mask} />
            </Panel>
            <Panel label="Découpe">
              <canvas ref={checker} />
            </Panel>
            <Panel label="Bords (zoom)">
              <canvas ref={zoom} />
            </Panel>
            <Panel label="Mot géant derrière">
              {fontReady ? (
                <GiantWordPreview photo={run.photo.image} cutout={result.cutout} box={stats?.box ?? null} width={width} height={height} />
              ) : (
                <div style={{ width, height }} />
              )}
            </Panel>
          </>
        )}
      </div>
    </li>
  );
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="flex flex-col gap-1">
      <div className="overflow-hidden rounded-lg">{children}</div>
      <figcaption className="text-xs font-bold uppercase tracking-[0.12em] text-nuit/60">{label}</figcaption>
    </figure>
  );
}
