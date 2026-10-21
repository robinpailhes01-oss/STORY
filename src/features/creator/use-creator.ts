"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import type { CreatorState, CreatorStore } from "./store";

export const CreatorContext = createContext<CreatorStore | null>(null);

export function useStore(): CreatorStore {
  const store = useContext(CreatorContext);
  if (!store) throw new Error("CreatorContext manquant");
  return store;
}

/** État courant du créateur (re-rendu à chaque changement). */
export function useCreator(): CreatorState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
