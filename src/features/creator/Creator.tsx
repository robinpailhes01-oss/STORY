"use client";

import { useEffect, useState } from "react";
import { CreateScreen } from "./create/CreateScreen";
import { EditorScreen } from "./editor/EditorScreen";
import { GenerationScreen } from "./GenerationScreen";
import { CreatorStore } from "./store";
import { CreatorContext, useCreator } from "./use-creator";

/** La page « 3 photos + une idée → 5 stories » : Créer, Génération, Éditeur. */
export default function Creator() {
  const [store] = useState(() => new CreatorStore());

  useEffect(() => {
    void store.start();
    // Dernier enregistrement du brouillon quand la page passe en arrière-plan ou se ferme.
    const flush = () => store.flushSave();
    const onVisibility = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      store.dispose();
    };
  }, [store]);

  return (
    <CreatorContext.Provider value={store}>
      <Screens />
    </CreatorContext.Provider>
  );
}

function Screens() {
  const { phase } = useCreator();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.dataset.screen = phase;
  }, [phase]);

  if (phase === "loading") return <Loading label="Ouverture de ton brouillon…" />;
  if (phase === "generating") return <GenerationScreen />;
  if (phase === "editor") return <EditorScreen />;
  return <CreateScreen />;
}

export function Loading({ label }: { label: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4" role="status" data-screen="loading">
      <span className="spin block size-8 rounded-full border-2 border-white/80 border-t-transparent" aria-hidden />
      <p className="text-sm text-mute">{label}</p>
    </div>
  );
}
