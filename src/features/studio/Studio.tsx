"use client";

import type Konva from "konva";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadLumaExample } from "@/domain/examples";
import type { StoryDocument } from "@/domain/story-document";
import { ExportStage } from "@/features/renderer/ExportStage";
import { StoryPreview } from "@/features/renderer/StoryPreview";
import { GUIDE_FONT, GUIDE_TEXT } from "@/features/renderer/StorySlide";
import { downloadBlob } from "@/lib/export/download";
import { pngFileName, stageToPng, type ExportedPng } from "@/lib/export/png";
import { zipPngs } from "@/lib/export/zip";
import { loadFonts, type LoadedFontReport } from "@/lib/fonts/load-fonts";
import { fontRequirements, layoutDocument } from "@/lib/layout/document-layout";
import { luma } from "@/styles/brands/luma";
import { publishRenderReport } from "./render-report";

const PREVIEW_WIDTH = 270; // 1080 / 4

type FontState =
  | { status: "loading" }
  | { status: "ready"; report: LoadedFontReport[] }
  | { status: "error"; message: string };

type ExportState =
  | { status: "idle" }
  | { status: "running"; done: number }
  | { status: "done"; files: ExportedPng[]; urls: string[] }
  | { status: "error"; message: string };

function offPaletteColors(doc: StoryDocument): string[] {
  const palette = new Set(Object.values(luma).map((c) => c.toUpperCase()));
  const used = new Set<string>();
  for (const slide of doc.slides) {
    if (slide.background.kind === "solid") used.add(slide.background.color.toUpperCase());
    for (const block of slide.blocks) {
      if (block.kind === "text") used.add(block.style.color.toUpperCase());
      if (block.kind === "shape") used.add(block.fill.toUpperCase());
    }
  }
  return [...used].filter((c) => !palette.has(c));
}

export default function Studio() {
  const loaded = useMemo(() => {
    try {
      return { doc: loadLumaExample() };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, []);
  const doc = loaded.doc;

  const [fonts, setFonts] = useState<FontState>({ status: "loading" });
  const [fontsVersion, setFontsVersion] = useState(0);
  const [showGuides, setShowGuides] = useState(false);
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });
  const [exportIndex, setExportIndex] = useState<number | null>(null);
  const pendingStage = useRef<((stage: Konva.Stage) => void) | null>(null);

  const requirements = useMemo(
    () => (doc ? [...fontRequirements(doc), { ...GUIDE_FONT, text: GUIDE_TEXT }] : []),
    [doc],
  );

  // 1. Attendre les polices (document.fonts.load) avant toute mesure.
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    loadFonts(requirements)
      .then((report) => !cancelled && setFonts({ status: "ready", report }))
      .catch((error: Error) => !cancelled && setFonts({ status: "error", message: error.message }));
    // 2. Toute police chargée plus tard relance mesure et dessin.
    const onFontsLoaded = () => setFontsVersion((v) => v + 1);
    document.fonts.addEventListener("loadingdone", onFontsLoaded);
    return () => {
      cancelled = true;
      document.fonts.removeEventListener("loadingdone", onFontsLoaded);
    };
  }, [doc, requirements]);

  const layout = useMemo(() => {
    if (!doc || fonts.status !== "ready") return null;
    void fontsVersion; // dépendance volontaire : remesurer après chaque chargement de police
    return layoutDocument(doc);
  }, [doc, fonts.status, fontsVersion]);

  useEffect(() => {
    if (doc && layout && fonts.status === "ready") publishRenderReport(doc.documentId, fonts.report, layout);
  }, [doc, layout, fonts]);

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
    if (!doc || !layout) return;
    if (layout.problems.length) {
      setExportState({ status: "error", message: "Export bloqué : corriger d’abord les problèmes de mise en page." });
      return;
    }
    setExportState({ status: "running", done: 0 });
    try {
      await loadFonts(requirements); // revérifie les polices juste avant de dessiner
      const files: ExportedPng[] = [];
      for (let index = 0; index < doc.slides.length; index++) {
        const stage = await new Promise<Konva.Stage>((resolve) => {
          pendingStage.current = resolve;
          setExportIndex(index);
        });
        const png = await stageToPng(stage);
        const slideId = doc.slides[index].id;
        files.push({ index, slideId, fileName: pngFileName(doc.documentId, index, slideId), ...png });
        setExportState({ status: "running", done: index + 1 });
      }
      setExportState({ status: "done", files, urls: files.map((f) => URL.createObjectURL(f.blob)) });
    } catch (error) {
      setExportState({ status: "error", message: `Export interrompu : ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setExportIndex(null);
      pendingStage.current = null;
    }
  }, [doc, layout, requirements]);

  const downloadZip = useCallback(async () => {
    if (exportState.status !== "done" || !doc) return;
    downloadBlob(await zipPngs(exportState.files), `${doc.documentId}.zip`);
  }, [exportState, doc]);

  if (!doc) return <ErrorBox title="Document illisible" message={loaded.error ?? ""} />;

  const offPalette = offPaletteColors(doc);
  const renderState = fonts.status === "ready" && layout ? "ready" : fonts.status === "error" ? "error" : "loading";

  return (
    <div data-render-state={renderState} className="flex flex-col gap-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-nuit/60">Séquence · {doc.slides.length} stories</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{doc.title}</h1>
          <p className="mt-1 text-sm text-nuit/70">
            Repère 1080 × 1920 · aperçu au quart · style {doc.stylePackId} {doc.stylePackVersion}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-nuit"
              checked={showGuides}
              onChange={(e) => setShowGuides(e.target.checked)}
            />
            Zones Instagram
          </label>
          <button
            type="button"
            onClick={runExport}
            disabled={renderState !== "ready" || exportState.status === "running"}
            className="rounded-full bg-nuit px-6 py-3 text-sm font-bold text-creme transition hover:bg-nuit/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exportState.status === "running" ? `Export… ${exportState.done}/${doc.slides.length}` : "Exporter"}
          </button>
        </div>
      </section>

      {fonts.status === "loading" && <p className="text-sm text-nuit/70">Chargement des polices…</p>}
      {fonts.status === "error" && <ErrorBox title="Rendu impossible" message={fonts.message} />}
      {layout && layout.problems.length > 0 && (
        <ErrorBox
          title="Mise en page à corriger"
          message={layout.problems.map((p) => `${p.slideId}/${p.blockId} : ${p.message}`).join("\n")}
        />
      )}
      {offPalette.length > 0 && (
        <p className="text-sm text-nuit/70">Couleurs hors charte Luma : {offPalette.join(", ")}</p>
      )}

      {layout && (
        <ol className="-mx-4 flex snap-x gap-5 overflow-x-auto px-4 py-3">
          {doc.slides.map((slide, index) => (
            <li key={slide.id} className="shrink-0 snap-start">
              <div
                data-preview={slide.id}
                className="overflow-hidden rounded-xl ring-1 ring-nuit/10 shadow-[0_1px_2px_rgba(23,38,61,0.08),0_8px_24px_rgba(23,38,61,0.10)]"
                style={{ width: PREVIEW_WIDTH }}
              >
                <StoryPreview slide={slide} layout={layout} displayWidth={PREVIEW_WIDTH} showGuides={showGuides} />
              </div>
              <p className="mt-2 text-xs font-bold tracking-wide text-nuit/60">
                {String(index + 1).padStart(2, "0")} · {slide.id}
              </p>
            </li>
          ))}
        </ol>
      )}

      {exportState.status === "error" && <ErrorBox title="Export" message={exportState.message} />}
      {exportState.status === "done" && (
        <section aria-live="polite" className="rounded-2xl bg-white/60 p-5 ring-1 ring-nuit/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">
              {exportState.files.length} PNG prêts · {exportState.files[0].width} × {exportState.files[0].height}
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
              <li key={file.fileName} className="flex w-[135px] flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- blob local, pas d’optimisation possible */}
                <img
                  src={exportState.urls[i]}
                  alt={`Story ${file.index + 1} exportée`}
                  width={135}
                  height={240}
                  className="rounded-md ring-1 ring-nuit/10"
                />
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

      {exportIndex !== null && layout && (
        <ExportStage slide={doc.slides[exportIndex]} layout={layout} onReady={onExportStageReady} />
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
