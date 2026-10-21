"use client";

import { useEffect, useState } from "react";
import { CreateHeader, CreateScreen } from "./create/CreateScreen";
import { ProfileCardSkeleton } from "./profile/ProfileCard";
import { EditorScreen } from "./editor/EditorScreen";
import { GenerationScreen } from "./GenerationScreen";
import { CreatorStore } from "./store";
import { CreatorContext, useCreator } from "./use-creator";

/** La page « 2 ou 3 photos (+ une idée facultative) → 5 stories » : Créer, Génération, Éditeur. */
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

  if (phase === "loading") return <OpeningSkeleton />;
  if (phase === "generating") return <GenerationScreen />;
  if (phase === "editor") return <EditorScreen />;
  return <CreateScreen />;
}

/** Pendant l’ouverture du brouillon : l’en-tête et la carte profil en squelette (comme la référence). */
function OpeningSkeleton() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-3 px-5 pt-[env(safe-area-inset-top)]" role="status" data-screen="loading">
      <CreateHeader />
      <ProfileCardSkeleton />
      <p className="sr-only">Ouverture de ton brouillon…</p>
    </div>
  );
}
