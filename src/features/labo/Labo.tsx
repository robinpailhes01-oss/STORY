"use client";

import type Konva from "konva";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EXAMPLE_PLAN } from "@/domain/example-plan";
import type { Slide, TextBlock } from "@/domain/story-document";
import { ExportStage } from "@/features/renderer/ExportStage";
import type { ImageTable } from "@/features/renderer/images";
import { StoryPreview } from "@/features/renderer/StoryPreview";
import { GUIDE_FONT, GUIDE_TEXT } from "@/features/renderer/StorySlide";
import { StyleSwatch, swatchFontRequirement } from "@/features/renderer/StyleSwatch";
import { composeSequence, fontRequirementsForSequence } from "@/lib/compose";
import { downloadBlob } from "@/lib/export/download";
import { pngFileName, stageToPng, type ExportedPng } from "@/lib/export/png";
import { zipPngs } from "@/lib/export/zip";
import { loadFonts, type LoadedFontReport } from "@/lib/fonts/load-fonts";
import { layoutDocument, type DocumentLayout } from "@/lib/layout/document-layout";
import { DEFAULT_STYLE_ID, STYLE_PRESETS, getStyle } from "@/styles/presets";
import { MIN_CONTRAST, sampleRects, type BackgroundSample } from "./contrast";
import { buildStyleReport, type LaboStyleReport } from "./labo-report";
import { TEST_PHOTOS, loadTestPhotos } from "./test-photos";

const PREVIEW_WIDTH = 216; // 1080 / 5
const PROBE_WIDTH = 270; // 1080 / 4 : fond seul, pour mesurer le contraste

type Loading<T> = { status: "loading" } | { status: "ready"; value: T } | { status: "error"; message: string };

type ExportState =
  | { status: "idle" }
  | { status: "running"; styleId: string; done: number }
  | { status: "done"; styleId: string; files: ExportedPng[]; urls: string[] }
  | { status: "error"; message: string };

const PHOTOS = TEST_PHOTOS.map(({ assetId, focalX, focalY }) => ({ assetId, focalX, focalY }));

/** Toutes les polices du laboratoire : 10 styles × séquence d’exemple, tuiles du sélecteur, guides. */
function allRequirements() {
  return [
    ...STYLE_PRESETS.flatMap((s) => fontRequirementsForSequence(EXAMPLE_PLAN, s.id)),
    ...STYLE_PRESETS.map(swatchFontRequirement),
    { ...GUIDE_FONT, text: GUIDE_TEXT },
  ];
}

/** Fond seul d’une story, dessiné hors écran pour lire les pixels réels sous chaque ligne de texte. */
function ContrastProbe({
  probeKey,
  slide,
  layout,
  images,
  onSample,
}: {
  probeKey: string;
  slide: Slide;
  layout: DocumentLayout;
  images: ImageTable;
  onSample: (key: string, samples: Record<string, BackgroundSample>) => void;
}) {
  const onStage = useCallback(
    (stage: Konva.Stage | null) => {
      if (!stage) return;
      const canvas = stage.toCanvas({ pixelRatio: 1 });
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const s = width / 1080;
      const samples: Record<string, BackgroundSample> = {};
      for (const block of slide.blocks.filter((b): b is TextBlock => b.kind === "text")) {
        const t = layout.texts.get(block.id);
        if (!t) continue;
        const rects = t.lines.map((l) => ({
          x: (block.x + l.x) * s,
          y: (block.y + l.top) * s,
          width: l.width * s,
          height: t.lineHeightPx * s,
        }));
        samples[block.id] = sampleRects(data, width, height, rects);
      }
      onSample(probeKey, samples);
    },
    [probeKey, slide, layout, onSample],
  );
  return <StoryPreview slide={slide} layout={layout} images={images} displayWidth={PROBE_WIDTH} showGuides={false} backgroundOnly onStage={onStage} />;
}

export default function Labo() {
  const [photos, setPhotos] = useState<Loading<ImageTable>>({ status: "loading" });
  const [fonts, setFonts] = useState<Loading<LoadedFontReport[]>>({ status: "loading" });
  const [fontsVersion, setFontsVersion] = useState(0);
  const [selected, setSelected] = useState(DEFAULT_STYLE_ID);
  const [showGuides, setShowGuides] = useState(false);
  const [samples, setSamples] = useState<Map<string, Record<string, BackgroundSample>>>(new Map());
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });
  const [exporting, setExporting] = useState<{ styleId: string; index: number } | null>(null);
  const pendingStage = useRef<((stage: Konva.Stage) => void) | null>(null);
  const requirements = useMemo(() => allRequirements(), []);

  // 1. Photos décodées et polices chargées avant toute mesure.
  useEffect(() => {
    let cancelled = false;
    loadTestPhotos()
      .then((value) => !cancelled && setPhotos({ status: "ready", value }))
      .catch((error: Error) => !cancelled && setPhotos({ status: "error", message: error.message }));
    loadFonts(requirements)
      .then((value) => !cancelled && setFonts({ status: "ready", value }))
      .catch((error: Error) => !cancelled && setFonts({ status: "error", message: error.message }));
    const onFontsLoaded = () => setFontsVersion((v) => v + 1);
    document.fonts.addEventListener("loadingdone", onFontsLoaded);
    return () => {
      cancelled = true;
      document.fonts.removeEventListener("loadingdone", onFontsLoaded);
    };
  }, [requirements]);

  // 2. Composition et mise en page de la séquence d’exemple dans chaque style.
  const compositions = useMemo(() => {
    if (fonts.status !== "ready") return null;
    void fontsVersion; // dépendance volontaire : remesurer après chaque chargement de police
    return STYLE_PRESETS.map((style) => {
      const result = composeSequence({ plan: EXAMPLE_PLAN, styleId: style.id, photos: PHOTOS });
      return { style, result, layout: layoutDocument(result.document) };
    });
  }, [fonts.status, fontsVersion]);

  const onSample = useCallback((key: string, value: Record<string, BackgroundSample>) => {
    setSamples((current) => new Map(current).set(key, value));
  }, []);

  const reports = useMemo<LaboStyleReport[] | null>(() => {
    if (!compositions) return null;
    return compositions.map(({ style, result, layout }) => buildStyleReport(style, result, layout, samples));
  }, [compositions, samples]);

  const probesDone = compositions !== null && samples.size === compositions.length * EXAMPLE_PLAN.stories.length;
  const ready = fonts.status === "ready" && photos.status === "ready" && compositions !== null && probesDone;

  useEffect(() => {
    if (!reports || fonts.status !== "ready" || photos.status !== "ready") return;
    window.__storyLabo = {
      ready,
      fonts: fonts.value,
      photos: [...photos.value.keys()],
      styles: reports,
    };
  }, [reports, fonts, photos, ready]);

  // Libérer les aperçus d’export précédents.
  useEffect(() => {
    if (exportState.status !== "done") return;
    return () => exportState.urls.forEach((url) => URL.revokeObjectURL(url));
  }, [exportState]);

  const onExportStageReady = useCallback((stage: Konva.Stage) => {
    pendingStage.current?.(stage);
    pendingStage.current = null;
  }, []);

  const runExport = useCallback(async () => {
    const entry = compositions?.find((c) => c.style.id === selected);
    if (!entry) return;
    const problems = [...entry.result.problems, ...entry.layout.problems.map((p) => p.message)];
    if (problems.length) {
      setExportState({ status: "error", message: `Export bloqué : ${problems.join(" ; ")}` });
      return;
    }
    setExportState({ status: "running", styleId: selected, done: 0 });
    try {
      await loadFonts(requirements); // revérifie les polices juste avant de dessiner
      const doc = entry.result.document;
      const files: ExportedPng[] = [];
      for (let index = 0; index < doc.slides.length; index++) {
        const stage = await new Promise<Konva.Stage>((resolve) => {
          pendingStage.current = resolve;
          setExporting({ styleId: selected, index });
        });
        const png = await stageToPng(stage);
        const slideId = doc.slides[index].id;
        files.push({ index, slideId, fileName: pngFileName(doc.documentId, index, slideId), ...png });
        setExportState({ status: "running", styleId: selected, done: index + 1 });
      }
      setExportState({ status: "done", styleId: selected, files, urls: files.map((f) => URL.createObjectURL(f.blob)) });
    } catch (error) {
      setExportState({ status: "error", message: `Export interrompu : ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setExporting(null);
      pendingStage.current = null;
    }
  }, [compositions, selected, requirements]);

  const downloadZip = useCallback(async () => {
    if (exportState.status !== "done") return;
    downloadBlob(await zipPngs(exportState.files), `sequence-${exportState.styleId}.zip`);
  }, [exportState]);

  const renderState = ready ? "ready" : fonts.status === "error" || photos.status === "error" ? "error" : "loading";
  const images = photos.status === "ready" ? photos.value : null;
  const exportEntry = exporting ? compositions?.find((c) => c.style.id === exporting.styleId) : undefined;
  const selectedStyle = getStyle(selected);

  return (
    <div data-render-state={renderState} className="flex flex-col gap-10">
      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-nuit/60">Laboratoire · moteur visuel</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Séquence d’exemple dans les {STYLE_PRESETS.length} styles</h1>
            <p className="mt-1 text-sm text-nuit/70">
              Repère 1080 × 1920 · photos de test synthétiques · contraste mesuré sur les pixels réels du fond (seuil {MIN_CONTRAST}:1)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-nuit" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} />
              Zones Instagram
            </label>
            <button
              type="button"
              onClick={runExport}
              disabled={renderState !== "ready" || exportState.status === "running"}
              className="rounded-full bg-nuit px-6 py-3 text-sm font-bold text-creme transition hover:bg-nuit/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {exportState.status === "running" ? `Export… ${exportState.done}/5` : `Exporter « ${selectedStyle.name} »`}
            </button>
          </div>
        </div>

        <div role="radiogroup" aria-label="Style" className="grid grid-cols-[repeat(auto-fill,176px)] gap-3">
          {STYLE_PRESETS.map((style) => (
            <button
              key={style.id}
              type="button"
              role="radio"
              aria-checked={selected === style.id}
              aria-label={style.name}
              data-style-button={style.id}
              onClick={() => setSelected(style.id)}
              className={`overflow-hidden rounded-xl ring-2 transition ${selected === style.id ? "ring-nuit" : "ring-transparent hover:ring-nuit/30"}`}
            >
              <StyleSwatch styleId={style.id} width={176} height={60} />
            </button>
          ))}
        </div>
      </section>

      {fonts.status === "loading" && <p className="text-sm text-nuit/70">Chargement des polices…</p>}
      {fonts.status === "error" && <ErrorBox title="Polices indisponibles" message={fonts.message} />}
      {photos.status === "error" && <ErrorBox title="Photos de test" message={photos.message} />}

      {exportState.status === "error" && <ErrorBox title="Export" message={exportState.message} />}
      {exportState.status === "done" && (
        <section aria-live="polite" className="rounded-2xl bg-white/60 p-5 ring-1 ring-nuit/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">
              {exportState.files.length} PNG prêts · {getStyle(exportState.styleId).name} · {exportState.files[0].width} × {exportState.files[0].height}
            </h2>
            <button
              type="button"
              onClick={downloadZip}
              data-download="zip"
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-nuit transition hover:brightness-95"
            >
              Télécharger le ZIP
            </button>
          </div>
          <ul className="mt-4 flex flex-wrap gap-4">
            {exportState.files.map((file, i) => (
              <li key={file.fileName} className="flex w-[108px] flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- blob local, pas d’optimisation possible */}
                <img src={exportState.urls[i]} alt={`Story ${file.index + 1} exportée`} width={108} height={192} className="rounded-md ring-1 ring-nuit/10" />
                <button
                  type="button"
                  onClick={() => downloadBlob(file.blob, file.fileName)}
                  data-download={file.slideId}
                  className="rounded-full px-3 py-1.5 text-xs font-bold ring-1 ring-nuit/25 transition hover:bg-nuit hover:text-creme"
                >
                  PNG {String(file.index + 1).padStart(2, "0")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {compositions && images && reports && (
        <div className="flex flex-col gap-10">
          {compositions.map(({ style, result, layout }, s) => {
            const report = reports[s];
            return (
              <section key={style.id} data-style-section={style.id} className="flex flex-col gap-3">
                <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h2 className={`text-xl font-extrabold ${selected === style.id ? "underline decoration-2 underline-offset-4" : ""}`}>{style.name}</h2>
                  <p className="text-sm text-nuit/70">{style.description}</p>
                  <p className="text-xs text-nuit/60">
                    Tailles : {report.sceneSizes.map((sc) => `${sc.stories.map((i) => i + 1).join("-")} → ${sc.fontSize} px`).join(" · ")}
                  </p>
                </header>
                {report.problems.length > 0 && <ErrorBox title="Problèmes bloquants" message={report.problems.join("\n")} />}
                {report.contrastWarnings.length > 0 && (
                  <WarningBox title={`Contraste sous ${MIN_CONTRAST}:1`} message={report.contrastWarnings.join("\n")} />
                )}
                {report.warnings.length > 0 && <WarningBox title="Avertissements" message={report.warnings.join("\n")} />}
                <ol className="-mx-4 flex gap-4 overflow-x-auto px-4 py-2">
                  {result.document.slides.map((slide, index) => {
                    const blocks = report.stories[index].blocks.filter((b) => !b.repeated && b.contrast !== null);
                    const minContrast = blocks.length ? Math.min(...blocks.map((b) => b.contrast!)) : null;
                    return (
                      <li key={slide.id} className="shrink-0">
                        <div
                          data-preview={`${style.id}/${slide.id}`}
                          className="overflow-hidden rounded-xl ring-1 ring-nuit/10 shadow-[0_1px_2px_rgba(23,38,61,0.08),0_8px_24px_rgba(23,38,61,0.10)]"
                          style={{ width: PREVIEW_WIDTH }}
                        >
                          <StoryPreview slide={slide} layout={layout} images={images} displayWidth={PREVIEW_WIDTH} showGuides={showGuides} />
                        </div>
                        <p className="mt-2 text-xs font-bold tracking-wide text-nuit/60">
                          {String(index + 1).padStart(2, "0")} · contraste min{" "}
                          <span className={minContrast !== null && minContrast < MIN_CONTRAST ? "text-[#B42318]" : ""}>
                            {minContrast === null ? "…" : `${minContrast.toFixed(1)}:1`}
                          </span>
                        </p>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>
      )}

      {compositions && images && (
        <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, width: 0, height: 0, overflow: "hidden" }}>
          {compositions.flatMap(({ style, result, layout }) =>
            result.document.slides.map((slide) => {
              const key = `${style.id}/${slide.id}`;
              return <ContrastProbe key={key} probeKey={key} slide={slide} layout={layout} images={images} onSample={onSample} />;
            }),
          )}
        </div>
      )}

      {exporting && exportEntry && images && (
        <ExportStage
          slide={exportEntry.result.document.slides[exporting.index]}
          layout={exportEntry.layout}
          images={images}
          onReady={onExportStageReady}
        />
      )}
    </div>
  );
}

function ErrorBox({ title, message }: { title: string; message: string }) {
  return (
    <div role="alert" className="rounded-xl bg-[#FDECEC] p-4 text-sm text-[#7A1E1E] ring-1 ring-[#F2B8B8]">
      <p className="font-bold">{title}</p>
      <pre className="mt-1 font-sans whitespace-pre-wrap">{message}</pre>
    </div>
  );
}

function WarningBox({ title, message }: { title: string; message: string }) {
  return (
    <div role="status" className="rounded-xl bg-[#FFF6E0] p-4 text-sm text-[#7A4B00] ring-1 ring-[#F1D58C]">
      <p className="font-bold">{title}</p>
      <pre className="mt-1 font-sans whitespace-pre-wrap">{message}</pre>
    </div>
  );
}
