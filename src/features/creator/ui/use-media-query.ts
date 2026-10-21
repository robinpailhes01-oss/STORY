"use client";

import { useSyncExternalStore } from "react";

/** true quand la requête média correspond ; suit les changements (rotation, redimensionnement). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
