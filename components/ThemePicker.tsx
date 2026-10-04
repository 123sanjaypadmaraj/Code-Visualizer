"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyTheme, useTheme } from "@/lib/theme";
import { THEMES, type Theme } from "@/lib/themes";

const GROUPS: { title: string; items: Theme[] }[] = [
  { title: "Dark themes", items: THEMES.filter((t) => t.kind === "dark") },
  { title: "Light themes", items: THEMES.filter((t) => t.kind === "light") },
];

/** VS Code-style colour theme picker: arrow keys preview live, Enter keeps, Esc reverts. Also Ctrl+K Ctrl+T. */
export default function ThemePicker() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  // the theme to fall back to if the picker is dismissed without choosing
  const [committed, setCommitted] = useState(theme.id);

  const show = useCallback(() => {
    setCommitted(theme.id);
    setActive(Math.max(0, THEMES.findIndex((t) => t.id === theme.id)));
    setOpen(true);
  }, [theme.id]);

  const close = useCallback((keep: boolean, id?: string) => {
    if (keep && id) applyTheme(id);
    else applyTheme(committed, false);
    setOpen(false);
    button.current?.focus();
  }, [committed]);

  const move = (i: number) => {
    const n = (i + THEMES.length) % THEMES.length;
    setActive(n);
    applyTheme(THEMES[n].id, false);
  };

  // Ctrl+K, then Ctrl+T within a second and a half — the same chord VS Code uses
  useEffect(() => {
    let armed = 0;
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === "k") {
        armed = Date.now();
      } else if (k === "t" && Date.now() - armed < 1500) {
        e.preventDefault();
        armed = 0;
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") move(active + 1);
    else if (e.key === "ArrowUp") move(active - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(THEMES.length - 1);
    else if (e.key === "Enter") close(true, THEMES[active].id);
    else if (e.key === "Escape") close(false);
    else if (e.key !== "Tab") return;
    if (e.key !== "Tab") e.preventDefault();
    else close(false);
  };

  return (
    <div ref={root} className="relative ml-auto">
      <button
        ref={button}
        onClick={() => (open ? close(false) : show())}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Color theme (Ctrl+K Ctrl+T)"
        className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm text-white/90 transition hover:border-violet-400/40 hover:bg-white/[0.1]"
      >
        <Swatch t={theme} />
        <span className="hidden sm:inline">{theme.label}</span>
        <span className="sm:hidden">Theme</span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Color theme"
          tabIndex={-1}
          ref={(el) => el?.focus()}
          onKeyDown={onListKey}
          className="pop-in absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-64 overflow-auto rounded-xl border border-white/15 bg-raised p-1.5 shadow-2xl outline-none"
        >
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">{g.title}</div>
              {g.items.map((t) => {
                const i = THEMES.indexOf(t);
                return (
                  <div
                    key={t.id}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => move(i)}
                    onClick={() => close(true, t.id)}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-white/90 ${i === active ? "bg-white/10" : ""}`}
                  >
                    <Swatch t={t} />
                    <span className="flex-1">{t.label}</span>
                    {t.id === committed && <span aria-hidden className="text-xs text-white/50">✓</span>}
                  </div>
                );
              })}
            </div>
          ))}
          <p className="px-2.5 pb-1 pt-2 text-[10px] text-white/40">↑↓ preview · Enter keep · Esc cancel</p>
        </div>
      )}
    </div>
  );
}

/** a tiny preview of a theme's own colours, independent of the active theme */
function Swatch({ t }: { t: Theme }) {
  return (
    <span aria-hidden className="grid h-5 w-5 shrink-0 grid-cols-2 grid-rows-2 overflow-hidden rounded border border-white/20" style={{ background: t.editorBg }}>
      <i style={{ background: t.syn.keyword }} />
      <i style={{ background: t.syn.string }} />
      <i style={{ background: t.syn.fn }} />
      <i style={{ background: t.syn.number }} />
    </span>
  );
}
