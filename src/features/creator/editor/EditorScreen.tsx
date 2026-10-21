"use client";

import type Konva from "konva";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STORY_COUNT } from "@/domain/story-plan";
import { getStructure, isStructureId } from "@/domain/structures";
import { ExportStage } from "@/features/renderer/ExportStage";
import type { ImageTable } from "@/features/renderer/images";
import type { ComposeResult } from "@/lib/compose";
import { stageToPng, type ExportedPng } from "@/lib/export/png";
import { loadFonts } from "@/lib/fonts/load-fonts";
import type { DocumentLayout } from "@/lib/layout/document-layout";
import { IDEA_MIN } from "../model/draft";
import { canRedo, canUndo } from "../model/history";
import { publishAppReport } from "../test-report";
import { useCreator, useStore } from "../use-creator";
import { IconChevronLeft, IconClose, IconImage, IconPalette, IconRedo, IconRefresh, IconText, IconUndo, IconWarning } from "../ui/icons";
import { ConfirmSheet } from "../ui/Sheet";
import { ContrastProbes, type ContrastResult } from "./ContrastProbes";
import { ExportSheet, type ExportState } from "./ExportSheet";
import { PhotoPanel } from "./PhotoPanel";
import { RemarksSheet, remarksCount, type Remarks } from "./RemarksSheet";
import { StoryViewport } from "./StoryViewport";
import { StylePanel } from "./StylePanel";
import { TextPanel } from "./TextPanel";
import { Thumbnails } from "./Thumbnails";
import { useSequenceRender } from "./use-sequence-render";

type Tool = "style" | "photo" | "texte";
type Modal = "remarques" | "refaire" | "export" | null;

const TOOL_TITLES: Record<Tool, string> = { style: "Style", photo: "Photo", texte: "Texte" };

const storyLabel = (slideId: string) => `Story ${Number(slideId.replace(/\D/g, "")) || slideId}`;

interface ExportJob {
  composition: ComposeResult;
  layout: DocumentLayout;
  images: ImageTable;
}

export function EditorScreen() {
  const store = useStore();
  const state = useCreator();
  const { history, storyIndex, photos: pool, idea, structure, planVersion } = state;
  const snapshot = history.present;
  const plan = snapshot.plan;
  const render = useSequenceRender(snapshot, pool);
  const { composition, layout, images, fontsReady, fontError } = render;

  const [tool, setTool] = useState<Tool | null>(null);
  const [modal, setModal] = useState<Modal>(null);
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
    snapshot.photos.forEach((id, slot) => {
      const photo = id ? pool.get(id) : undefined;
      photo?.warnings.forEach((w) => warnings.push(`Photo ${slot + 1} : ${w.message}`));
    });
    return { controls: snapshot.controls?.issues ?? [], problems: [...new Set(problems)], warnings: [...new Set(warnings)] };
  }, [fontError, composition, layout, contrast, snapshot.photos, snapshot.controls, pool]);
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
      },
      composition,
      layout,
    );
  }, [fontsReady, composition, layout, storyIndex, render.shownStyleId, snapshot.photos, remarks, history]);

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

  // ── Export : une story à la fois, mêmes images et polices revérifiées ──────────────────
  const runExport = async () => {
    if (!composition || !layout) return;
    if (remarks.problems.length) {
      setModal("remarques");
      return;
    }
    if (!fontsReady) {
      setExportState({ status: "error", message: "Les polices se chargent encore : réessaie dans un instant." });
      setModal("export");
      return;
    }
    const job: ExportJob = { composition, layout, images };
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
    } catch (error) {
      setExportState({ status: "error", message: `L’export n’a pas abouti : ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setExportIndex(null);
      setExportJob(null);
      pendingStage.current = null;
    }
  };

  const changeStory = (index: number) => store.setStoryIndex(index);
  const toggleTool = (t: Tool) => setTool((current) => (current === t ? null : t));

  if (!plan) return null;
  const slides = composition?.document.slides ?? [];
  const slide = slides[storyIndex] ?? null;
  const structureName = structure !== "auto" && isStructureId(structure) ? getStructure(structure).nom : "Auto";

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-[env(safe-area-inset-top)]" data-screen="editor">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 px-2 sm:px-4">
        <button type="button" onClick={store.goCreate} className="flex min-h-11 items-center gap-1 rounded-full pr-3 pl-1.5 text-[15px] font-bold text-soft hover:bg-white/5">
          <IconChevronLeft size={22} /> Créer
        </button>
        <button type="button" onClick={() => void runExport()} className="btn-chrome min-w-[118px] text-[16px]" data-action="exporter" disabled={!composition}>
          Exporter
        </button>
      </header>

      <div className="grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-2 sm:px-4">
        <div className="flex items-center">
          <button type="button" className="icon-btn" onClick={store.undo} disabled={!canUndo(history)} aria-label="Annuler" data-action="annuler">
            <IconUndo />
          </button>
          <button type="button" className="icon-btn" onClick={store.redo} disabled={!canRedo(history)} aria-label="Rétablir" data-action="retablir">
            <IconRedo />
          </button>
        </div>
        <p className="text-[15px] font-bold text-mute tabular-nums" aria-live="polite" data-testid="numero">
          <span className="sr-only">Story </span>
          {storyIndex + 1} / {STORY_COUNT}
        </p>
        <div className="flex justify-end">
          {count > 0 && (
            <button
              type="button"
              onClick={() => setModal("remarques")}
              data-action="remarques"
              className={`flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${
                remarks.problems.length ? "bg-red-500/20 text-red-100 ring-1 ring-red-400/40" : "bg-amber-300/12 text-amber-100 ring-1 ring-amber-200/25"
              }`}
              aria-label={`Remarques : ${count}${remarks.problems.length ? ", dont des problèmes à corriger avant l’export" : ""}`}
            >
              <IconWarning size={15} /> Remarques <span className="tabular-nums">{count}</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:gap-6 lg:px-6 lg:pb-3">
        <div className="flex min-h-0 flex-1 flex-col items-stretch gap-3 px-4 pt-2 pb-2">
          <StoryViewport slide={slide} layout={layout} images={images} index={storyIndex} count={STORY_COUNT} onChange={changeStory} sideArrows={false} />
          {layout && slides.length > 0 && (
            <div className={tool ? "hidden shrink-0 lg:block" : "shrink-0"}>
              <Thumbnails slides={slides} layout={layout} images={images} index={storyIndex} onChange={changeStory} width={44} />
            </div>
          )}
        </div>

        {tool && (
          <aside
            aria-label={TOOL_TITLES[tool]}
            data-panel={tool}
            className="sheet-up surface mx-2 flex max-h-[47dvh] shrink-0 flex-col rounded-[26px] lg:mx-0 lg:max-h-none lg:w-[420px] lg:self-stretch"
          >
            <div className="flex shrink-0 items-center justify-between px-4 pt-2">
              <h2 className="text-[15px] font-bold text-white">
                {TOOL_TITLES[tool]}
                {tool !== "style" && <span className="font-normal text-mute"> · story {storyIndex + 1}</span>}
              </h2>
              <button type="button" className="icon-btn -mr-2" onClick={() => setTool(null)} aria-label={`Fermer le panneau ${TOOL_TITLES[tool]}`}>
                <IconClose size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
              {tool === "style" && <StylePanel plan={plan} styleId={snapshot.styleId} onChange={store.setStyle} />}
              {tool === "photo" && <PhotoPanel />}
              {tool === "texte" && <TextPanel key={`${storyIndex}-${planVersion}`} plan={plan} storyIndex={storyIndex} />}
            </div>
          </aside>
        )}
      </div>

      <nav aria-label="Outils" className="shrink-0 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),10px)]">
        <div className="capsule mx-auto flex max-w-[520px] rounded-[30px] p-1.5">
          <ToolButton label="Style" icon={<IconPalette />} active={tool === "style"} onClick={() => toggleTool("style")} />
          <ToolButton label="Photo" icon={<IconImage />} active={tool === "photo"} onClick={() => toggleTool("photo")} />
          <ToolButton label="Texte" icon={<IconText />} active={tool === "texte"} onClick={() => toggleTool("texte")} />
          <ToolButton label="Refaire" icon={<IconRefresh />} active={false} onClick={() => setModal("refaire")} pressable={false} />
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
      {modal === "refaire" &&
        (idea.trim().length >= IDEA_MIN ? (
          <ConfirmSheet
            title="Refaire la séquence ?"
            message={
              <>
                <p>
                  L’IA réécrit les 5 stories à partir de la même idée (structure : {structureName}), en évitant l’accroche actuelle. Tes photos et ton style sont
                  gardés.
                </p>
                <p className="mt-2 text-mute">Tu pourras revenir à cette version avec Annuler (↶).</p>
              </>
            }
            confirmLabel="Refaire"
            onCancel={() => setModal(null)}
            onConfirm={() => {
              setModal(null);
              setTool(null);
              void store.generate("refaire");
            }}
          />
        ) : (
          <ConfirmSheet
            title="Il manque ton idée"
            message="Pour refaire la séquence, écris d’abord ton idée sur l’écran Créer."
            confirmLabel="Écrire mon idée"
            onCancel={() => setModal(null)}
            onConfirm={() => {
              setModal(null);
              store.goCreate();
            }}
          />
        ))}
      {modal === "export" && exportState && (
        <ExportSheet
          state={exportState}
          onClose={() => {
            setModal(null);
            setExportState(null);
          }}
        />
      )}

      <ContrastProbes composition={composition} layout={layout} images={images} onResult={setContrast} />
      {exportJob && exportIndex !== null && (
        <ExportStage
          slide={exportJob.composition.document.slides[exportIndex]}
          layout={exportJob.layout}
          images={exportJob.images}
          onReady={onExportStageReady}
        />
      )}
    </div>
  );
}

function ToolButton({
  label,
  icon,
  active,
  onClick,
  pressable = true,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  pressable?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressable ? active : undefined}
      data-tool={label.toLowerCase()}
      className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 rounded-[24px] text-[13px] font-bold transition ${
        active ? "bg-white/[0.09] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" : "text-soft hover:text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
