"use client";

import type Konva from "konva";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Stroke } from "@/domain/render-options";
import { DRAWING_LIMITS } from "@/domain/story-document";
import { STORY_COUNT } from "@/domain/story-plan";
import { AUTO_STRUCTURE, getStructure, isStructureId } from "@/domain/structures";
import { ExportStage } from "@/features/renderer/ExportStage";
import { cutoutWarnings, type ImageTable } from "@/features/renderer/images";
import type { ComposeResult } from "@/lib/compose";
import { stageToPng, type ExportedPng } from "@/lib/export/png";
import { loadFonts } from "@/lib/fonts/load-fonts";
import type { DocumentLayout } from "@/lib/layout/document-layout";
import { getStyle } from "@/styles/presets";
import { canRedo, canUndo } from "../model/history";
import type { RewriteState } from "../store";
import { publishAppReport } from "../test-report";
import { useCreator, useStore } from "../use-creator";
import {
  IconChevronLeft,
  IconClose,
  IconImage,
  IconMinus,
  IconPalette,
  IconPen,
  IconPlus,
  IconRedo,
  IconRefresh,
  IconText,
  IconUndo,
  IconWarning,
} from "../ui/icons";
import { useMediaQuery } from "../ui/use-media-query";
import { ContrastProbes, type ContrastResult } from "./ContrastProbes";
import { DrawingLayer } from "./DrawingLayer";
import { ExportSheet, type ExportState } from "./ExportSheet";
import { PEN_WIDTHS, PenPanel, type PenSettings } from "./PenPanel";
import { PhotoPanel } from "./PhotoPanel";
import { Presenter } from "./Presenter";
import { RefaireSheet } from "./RefaireSheet";
import { RemarksSheet, remarksCount, type Remarks } from "./RemarksSheet";
import { StoryViewport } from "./StoryViewport";
import { StylePanel } from "./StylePanel";
import { TextPanel } from "./TextPanel";
import { Thumbnails } from "./Thumbnails";
import { useCutouts } from "./use-cutouts";
import { useSequenceRender } from "./use-sequence-render";

type Tool = "style" | "photo" | "crayon" | "texte";
type Modal = "remarques" | "refaire" | "export" | null;

const TOOL_TITLES: Record<Tool, string> = { style: "Style", photo: "Photo", crayon: "Crayon", texte: "Texte" };
/** Zoom de l’aperçu : 50 % à 200 %. */
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

const storyLabel = (slideId: string) => `Story ${Number(slideId.replace(/\D/g, "")) || slideId}`;

interface ExportJob {
  composition: ComposeResult;
  layout: DocumentLayout;
  images: ImageTable;
  cutouts: ImageTable;
}

export function EditorScreen() {
  const store = useStore();
  const state = useCreator();
  const { history, storyIndex, photos: pool, mode, idea, structure, planVersion, rewrite } = state;
  const snapshot = history.present;
  const plan = snapshot.plan;
  const render = useSequenceRender(snapshot, pool);
  const cutouts = useCutouts(snapshot.styleId, snapshot.photos, pool);
  const wide = useMediaQuery("(min-width: 1024px)");
  const { composition, layout, images, fontsReady, fontError } = render;

  const [tool, setTool] = useState<Tool | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [zoom, setZoom] = useState(1);
  const [presenting, setPresenting] = useState(false);
  const [pen, setPen] = useState<PenSettings>({ tool: "stylo", color: null, size: 1 });
  const [penMessage, setPenMessage] = useState<string | null>(null);
  const [contrast, setContrast] = useState<ContrastResult | null>(null);
  const [exportState, setExportState] = useState<ExportState | null>(null);
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [exportIndex, setExportIndex] = useState<number | null>(null);
  const pendingStage = useRef<((stage: Konva.Stage) => void) | null>(null);

  // ── Remarques : contrôles de l’IA, problèmes et avertissements de mise en page ─────────────
  const remarks = useMemo<Remarks>(() => {
    const problems: string[] = [];
    const warnings: string[] = [];
    if (fontError) problems.push(`Police : ${fontError}`);
    if (composition) problems.push(...composition.problems.map((p) => p.replace(/^stor(y|ies) /, (m) => m[0].toUpperCase() + m.slice(1))));
    layout?.problems.forEach((p) => problems.push(`${storyLabel(p.slideId)} : ${p.message}`));
    if (composition) warnings.push(...composition.warnings.map((w) => w.charAt(0).toUpperCase() + w.slice(1)));
    layout?.warnings.forEach((w) => warnings.push(`${storyLabel(w.slideId)} : ${w.message}`));
    contrast?.warnings.forEach((w) => warnings.push(w.message));
    // Détourage : la raison par photo (aucune personne, erreur), sinon ce qui manque story par story.
    if (cutouts.needed && !cutouts.computing && composition) {
      if (cutouts.warnings.length) warnings.push(...cutouts.warnings);
      else warnings.push(...cutoutWarnings(composition.document, cutouts.table).map((w) => w.charAt(0).toUpperCase() + w.slice(1) + "."));
    }
    snapshot.photos.forEach((id, slot) => {
      const photo = id ? pool.get(id) : undefined;
      photo?.warnings.forEach((w) => warnings.push(`Photo ${slot + 1} : ${w.message}`));
    });
    // Identifiants techniques (« story_05/s5_p3 ») → « Story 5, paragraphe 3 ».
    const human = (m: string) =>
      m
        .replace(/\bstory_0?(\d)\/s\d_([pr])(\d+)/g, (_, n, kind, k) => `Story ${n}, paragraphe ${kind === "r" ? `repris ${k}` : k}`)
        .replace(/\bstory_0?(\d)\b/g, "Story $1");
    return {
      controls: snapshot.controls?.issues ?? [],
      problems: [...new Set(problems.map(human))],
      warnings: [...new Set(warnings.map(human))],
    };
  }, [fontError, composition, layout, contrast, cutouts, snapshot.photos, snapshot.controls, pool]);
  const count = remarksCount(remarks);

  // ── Rapport pour la vérification automatique ───────────────────────────────────────────
  useEffect(() => {
    publishAppReport(
      {
        ready: fontsReady && !!composition && !!layout,
        storyIndex,
        styleId: render.shownStyleId,
        photos: snapshot.photos,
        problems: remarks.problems,
        warnings: remarks.warnings,
        history: { past: history.past.length, future: history.future.length },
        zoom,
        cutouts: { needed: cutouts.needed, ids: [...cutouts.table.keys()], computing: cutouts.computing },
        controlCodes: (snapshot.controls?.issues ?? []).map((i) => i.code),
      },
      composition,
      layout,
    );
  }, [fontsReady, composition, layout, storyIndex, render.shownStyleId, snapshot.photos, snapshot.controls, remarks, history, zoom, cutouts]);

  // ── Raccourcis clavier : ⌘Z / ⇧⌘Z hors des champs de texte ─────────────────────────────
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(TEXTAREA|INPUT)$/.test(target.tagName)) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) store.redo();
      else store.undo();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [store]);

  // Libérer les images de l’export précédent.
  useEffect(() => {
    if (exportState?.status !== "done") return;
    return () => exportState.urls.forEach((url) => URL.revokeObjectURL(url));
  }, [exportState]);

  const onExportStageReady = useCallback((stage: Konva.Stage) => {
    pendingStage.current?.(stage);
    pendingStage.current = null;
  }, []);

  // ── Export : une story à la fois, mêmes images, détourages et polices revérifiées ───────
  const runExport = async () => {
    if (!composition || !layout) return;
    if (remarks.problems.length) {
      setModal("remarques");
      return;
    }
    if (!fontsReady || cutouts.computing) {
      setExportState({ status: "error", message: cutouts.computing ? "Le détourage se termine : réessaie dans un instant." : "Les polices se chargent encore : réessaie dans un instant." });
      setModal("export");
      return;
    }
    const job: ExportJob = { composition, layout, images, cutouts: cutouts.table };
    const total = job.composition.document.slides.length;
    setModal("export");
    setExportState({ status: "running", done: 0, total });
    setExportJob(job);
    try {
      await loadFonts(render.requirements);
      const date = new Date().toISOString().slice(0, 10);
      const files: ExportedPng[] = [];
      for (let index = 0; index < total; index++) {
        const stage = await new Promise<Konva.Stage>((resolve) => {
          pendingStage.current = resolve;
          setExportIndex(index);
        });
        const png = await stageToPng(stage);
        const slideId = job.composition.document.slides[index].id;
        files.push({ index, slideId, fileName: `story-${date}-${String(index + 1).padStart(2, "0")}.png`, ...png });
        setExportState({ status: "running", done: index + 1, total });
      }
      setExportState({ status: "done", files, urls: files.map((f) => URL.createObjectURL(f.blob)), zipName: `stories-${date}.zip` });
      store.rememberExport(); // mémoire de ta voix
    } catch (error) {
      setExportState({ status: "error", message: `L’export n’a pas abouti : ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setExportIndex(null);
      setExportJob(null);
      pendingStage.current = null;
    }
  };

  const changeStory = (index: number) => {
    setPenMessage(null);
    store.setStoryIndex(index);
  };
  const thumbWidth = wide ? 54 : 44;
  const toggleTool = (t: Tool) => setTool((current) => (current === t ? null : t));
  const zoomIndex = ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]);

  if (!plan) return null;
  const slides = composition?.document.slides ?? [];
  const slide = slides[storyIndex] ?? null;
  const structureName = structure !== AUTO_STRUCTURE && isStructureId(structure) ? getStructure(structure).nom : "Auto";
  const penAccent = snapshot.options.accentColor ?? getStyle(snapshot.styleId).colors.accent;
  const strokes = snapshot.drawings[storyIndex]?.length ?? 0;
  const rewriting = !!rewrite && rewrite.error === null;

  const addStroke = (stroke: Stroke) => {
    if (!store.addStroke(storyIndex, stroke)) setPenMessage(`${DRAWING_LIMITS.strokesPerStory} traits au plus par story : efface-en pour continuer.`);
    else setPenMessage(null);
  };

  const overlay = rewrite ? (
    <RewriteOverlay rewrite={rewrite} onCancel={store.cancelRewrite} onRetry={() => void store.rewriteStory(rewrite.storyIndex, rewrite.instruction)} />
  ) : tool === "crayon" ? (
    <DrawingLayer
      tool={pen.tool}
      color={pen.color ?? penAccent}
      width={PEN_WIDTHS[pen.tool][pen.size]}
      full={strokes >= DRAWING_LIMITS.strokesPerStory}
      onStroke={addStroke}
      onRefused={() => setPenMessage(`${DRAWING_LIMITS.strokesPerStory} traits au plus par story : efface-en pour continuer.`)}
    />
  ) : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-[env(safe-area-inset-top)]" data-screen="editor">
      <header className="mx-auto flex h-[60px] w-full max-w-[1180px] shrink-0 items-center justify-between gap-2 px-2 sm:px-4">
        <button type="button" onClick={store.goCreate} className="flex min-h-11 items-center gap-0.5 rounded-full pr-3 pl-1 text-[15px] font-bold text-soft hover:bg-white/5">
          <IconChevronLeft size={22} /> Créer
        </button>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPresenting(true)}
            disabled={!composition || !layout}
            className="min-h-11 rounded-full px-3 text-[16px] font-bold text-soft hover:text-white disabled:opacity-40"
            data-action="presenter"
          >
            Présenter
          </button>
          <button type="button" onClick={() => void runExport()} className="btn-chrome min-w-[118px] text-[16px]" data-action="exporter" disabled={!composition}>
            Exporter
          </button>
        </div>
      </header>

      <div className="mx-auto grid h-12 w-full max-w-[1180px] shrink-0 grid-cols-[1fr_auto_1fr] items-center px-1 sm:px-4">
        <div className="flex items-center">
          <button type="button" className="icon-btn" onClick={store.undo} disabled={!canUndo(history)} aria-label="Annuler" data-action="annuler">
            <IconUndo />
          </button>
          <button type="button" className="icon-btn" onClick={store.redo} disabled={!canRedo(history)} aria-label="Rétablir" data-action="retablir">
            <IconRedo />
          </button>
        </div>
        <div className="flex items-center" role="group" aria-label="Zoom de l’aperçu">
          <button type="button" className="icon-btn" aria-label="Dézoomer" disabled={zoomIndex <= 0} onClick={() => setZoom(ZOOM_STEPS[zoomIndex - 1])} data-action="zoom-moins">
            <IconMinus size={20} />
          </button>
          <button
            type="button"
            className="min-h-11 min-w-[60px] text-[15px] font-bold text-soft tabular-nums"
            aria-label={`Zoom ${Math.round(zoom * 100)} %${zoom !== 1 ? ", revenir à 100 %" : ""}`}
            onClick={() => setZoom(1)}
            data-testid="zoom"
          >
            {Math.round(zoom * 100)} %
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Zoomer"
            disabled={zoomIndex >= ZOOM_STEPS.length - 1}
            onClick={() => setZoom(ZOOM_STEPS[zoomIndex + 1])}
            data-action="zoom-plus"
          >
            <IconPlus size={20} />
          </button>
        </div>
        <div className="flex items-center justify-end gap-0.5">
          <p className="px-1.5 text-[15px] font-bold text-mute tabular-nums" aria-live="polite" data-testid="numero">
            <span className="sr-only">Story </span>
            {storyIndex + 1} / {STORY_COUNT}
          </p>
          {count > 0 && (
            <button
              type="button"
              onClick={() => setModal("remarques")}
              data-action="remarques"
              className="flex size-11 items-center justify-center"
              aria-label={`Remarques : ${count}${remarks.problems.length ? ", dont des problèmes à corriger avant l’export" : ""}`}
            >
              <span
                className={`flex h-7 items-center gap-1 rounded-full px-2 text-xs font-bold ${
                  remarks.problems.length ? "bg-red-500/20 text-red-100 ring-1 ring-red-400/40" : "bg-amber-300/10 text-amber-100 ring-1 ring-amber-200/20"
                }`}
              >
                <IconWarning size={13} />
                <span className="tabular-nums">{count}</span>
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-[1180px] flex-1 flex-col lg:flex-row lg:gap-6 lg:px-6 lg:pb-3">
        <div className="flex min-h-0 flex-1 flex-col items-stretch gap-3 px-4 pt-2 pb-2">
          <StoryViewport
            slide={slide}
            layout={layout}
            images={images}
            cutouts={cutouts.table}
            index={storyIndex}
            count={STORY_COUNT}
            onChange={changeStory}
            zoom={zoom}
            swipe={tool !== "crayon" && !rewrite}
            overlay={overlay}
          />
          {layout && slides.length > 0 && (
            <div className={tool ? "hidden shrink-0 lg:block" : "shrink-0"}>
              <Thumbnails slides={slides} layout={layout} images={images} cutouts={cutouts.table} index={storyIndex} onChange={changeStory} width={thumbWidth} />
            </div>
          )}
        </div>

        {tool && (
          <aside
            aria-label={TOOL_TITLES[tool]}
            data-panel={tool}
            className={`sheet-up surface flex shrink-0 flex-col rounded-t-[28px] lg:mx-0 lg:max-h-none lg:w-[420px] lg:self-stretch lg:rounded-[28px] ${
              tool === "crayon" ? "max-h-[44dvh]" : tool === "style" ? "max-h-[42dvh]" : "max-h-[50dvh]"
            }`}
          >
            <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/20 lg:hidden" />
            <div className="flex shrink-0 items-center justify-between pr-2 pl-5">
              <h2 className="panel-title">
                {TOOL_TITLES[tool]}
                {(tool === "texte" || tool === "crayon") && <span className="tracking-[0.2em] text-mute"> · story {storyIndex + 1}</span>}
              </h2>
              <button type="button" className="icon-btn" onClick={() => setTool(null)} aria-label={`Fermer le panneau ${TOOL_TITLES[tool]}`}>
                <IconClose size={22} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
              {tool === "style" && (
                <StylePanel plan={plan} styleId={snapshot.styleId} options={snapshot.options} cutouts={cutouts} onStyle={store.setStyle} onOptions={store.setOptions} />
              )}
              {tool === "photo" && <PhotoPanel />}
              {tool === "crayon" && (
                <PenPanel
                  settings={pen}
                  accent={penAccent}
                  strokes={strokes}
                  message={penMessage}
                  onChange={setPen}
                  onUndoStroke={() => store.removeLastStroke(storyIndex)}
                  onClear={() => store.clearStrokes(storyIndex)}
                  onDone={() => setTool(null)}
                />
              )}
              {tool === "texte" && <TextPanel key={`${storyIndex}-${planVersion}`} plan={plan} storyIndex={storyIndex} />}
            </div>
          </aside>
        )}
      </div>

      <nav aria-label="Outils" className="shrink-0 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),10px)]">
        <div className="capsule mx-auto flex max-w-[560px] rounded-[30px] p-1.5">
          <ToolButton label="Style" icon={<IconPalette />} active={tool === "style"} onClick={() => toggleTool("style")} />
          <ToolButton label="Photo" icon={<IconImage />} active={tool === "photo"} onClick={() => toggleTool("photo")} />
          <ToolButton label="Crayon" icon={<IconPen />} active={tool === "crayon"} onClick={() => toggleTool("crayon")} disabled={rewriting} />
          <ToolButton label="Texte" icon={<IconText />} active={tool === "texte"} onClick={() => toggleTool("texte")} />
          <ToolButton label="Refaire" icon={<IconRefresh />} active={modal === "refaire"} onClick={() => setModal("refaire")} pressable={false} disabled={rewriting} />
        </div>
      </nav>

      {modal === "remarques" && (
        <RemarksSheet
          remarks={remarks}
          onClose={() => setModal(null)}
          onGoToStory={(i) => {
            changeStory(i);
            setModal(null);
          }}
        />
      )}
      {modal === "refaire" && (
        <RefaireSheet
          storyIndex={storyIndex}
          structureName={structureName}
          canRedoAll={mode === "idee" || idea.trim().length > 0}
          onClose={() => setModal(null)}
          onStory={(instruction) => {
            setModal(null);
            void store.rewriteStory(storyIndex, instruction);
          }}
          onAll={() => {
            setModal(null);
            setTool(null);
            void store.generate("refaire");
          }}
        />
      )}
      {modal === "export" && exportState && (
        <ExportSheet
          state={exportState}
          onClose={() => {
            setModal(null);
            setExportState(null);
          }}
        />
      )}
      {presenting && layout && slides.length > 0 && (
        <Presenter
          slides={slides}
          layout={layout}
          images={images}
          cutouts={cutouts.table}
          start={storyIndex}
          onClose={(last) => {
            setPresenting(false);
            changeStory(last);
          }}
        />
      )}

      <ContrastProbes composition={composition} layout={layout} images={images} onResult={setContrast} />
      {exportJob && exportIndex !== null && (
        <ExportStage
          slide={exportJob.composition.document.slides[exportIndex]}
          layout={exportJob.layout}
          images={exportJob.images}
          cutouts={exportJob.cutouts}
          onReady={onExportStageReady}
        />
      )}
    </div>
  );
}

/** Réécriture d’une story en cours (annulable) ou en erreur (réessayer), posée sur l’aperçu. */
function RewriteOverlay({ rewrite, onCancel, onRetry }: { rewrite: RewriteState; onCancel: () => void; onRetry: () => void }) {
  if (!rewrite.error) {
    return (
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/60 p-5 text-center backdrop-blur-[3px]" role="status" data-testid="reecriture">
        <span className="spin block size-8 rounded-full border-2 border-white/80 border-t-transparent" aria-hidden />
        <p className="text-[15px] font-bold text-white" aria-live="polite">
          Nouvelle version de la story {rewrite.storyIndex + 1}…
        </p>
        {rewrite.instruction && <p className="text-[13px] text-soft">« {rewrite.instruction} »</p>}
        {rewrite.notice && <p className="text-[12px] text-amber-100">{rewrite.notice}</p>}
        <button type="button" className="btn-ghost min-h-11 text-sm" onClick={onCancel}>
          Annuler
        </button>
      </div>
    );
  }
  return (
    <div className="absolute inset-x-3 bottom-3 z-20 flex flex-col gap-3 rounded-2xl border border-red-400/30 bg-[#1b0f12]/95 p-3.5" role="alert" data-error-code={rewrite.error.code}>
      <p className="text-[13px] leading-snug text-red-100">
        <span className="font-bold">La story {rewrite.storyIndex + 1} n’a pas pu être refaite. </span>
        {rewrite.error.message}
      </p>
      <div className="flex gap-2">
        <button type="button" className="btn-chrome min-h-11 flex-1 text-sm" onClick={onRetry} disabled={rewrite.error.retryAfterSec !== undefined}>
          Réessayer
        </button>
        <button type="button" className="btn-ghost min-h-11 text-sm" onClick={onCancel}>
          Fermer
        </button>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  icon,
  active,
  onClick,
  pressable = true,
  disabled = false,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  pressable?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressable ? active : undefined}
      data-tool={label.toLowerCase()}
      className={`flex min-h-[58px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[24px] text-[13px] font-bold transition disabled:opacity-40 ${
        active ? "bg-white/[0.1] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_4px_14px_rgba(0,0,0,0.35)]" : "text-soft hover:text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
