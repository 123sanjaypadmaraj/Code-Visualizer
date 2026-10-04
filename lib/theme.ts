"use client";
import { useSyncExternalStore } from "react";
import { DEFAULT_THEME, THEME_STORAGE_KEY, isThemeId, themeById, type Theme } from "./themes";

const listeners = new Set<() => void>();

/** The theme currently painted: `<html data-theme>` is the source of truth (the init script sets it before first paint). */
function current(): string {
  const id = document.documentElement.dataset.theme;
  return isThemeId(id) ? id : DEFAULT_THEME;
}

/** Apply a theme. `persist: false` is for live previews while browsing the picker. */
export function applyTheme(id: string, persist = true) {
  if (!isThemeId(id)) return;
  document.documentElement.dataset.theme = id;
  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      // storage can be blocked; the theme still applies for this session
    }
  }
  listeners.forEach((l) => l());
}

export function useTheme(): Theme {
  const id = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current,
    () => DEFAULT_THEME,
  );
  return themeById(id);
}
