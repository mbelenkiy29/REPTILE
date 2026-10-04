"use client";
import * as React from "react";

// localStorage-backed value for per-viewer conveniences (theme, sidebar). Reads are wrapped in
// try/catch because storage can throw in private windows; the fallback is always a valid state.
const EVENT = "countersign:storage";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the value lasts for this page only via the event below */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { key, value } }));
}

export function useStored(key: string): string | null {
  const memory = React.useRef<string | null | undefined>(undefined);
  const subscribe = React.useCallback(
    (cb: () => void) => {
      const onCustom = (e: Event) => {
        const d = (e as CustomEvent<{ key: string; value: string | null }>).detail;
        if (d.key === key) {
          memory.current = d.value;
          cb();
        }
      };
      const onStorage = (e: StorageEvent) => e.key === key && cb();
      window.addEventListener(EVENT, onCustom);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener(EVENT, onCustom);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => read(key) ?? (memory.current === undefined ? null : memory.current),
    () => null,
  );
}
