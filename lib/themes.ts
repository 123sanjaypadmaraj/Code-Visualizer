/**
 * Colour themes, in the spirit of VS Code's "Color Theme" picker.
 *
 * This file is the single source of truth: `themesCss()` turns it into CSS custom properties that
 * the layout injects, so switching themes is just changing `<html data-theme>` — no re-render of
 * the page and no reconfiguring of the code editor (its theme reads the same variables).
 */

export type ThemeKind = "dark" | "light";

export interface Theme {
  id: string;
  label: string;
  kind: ThemeKind;
  /** page background behind everything */
  bg: string;
  /** main text colour; every `text-white/..`, `bg-white/..`, `border-white/..` utility is derived from it */
  ink: string;
  muted: string;
  accent: string;
  accent2: string;
  /** third glow colour in the page background */
  glow3: string;
  /** primary-button gradient; defaults to accent → accent2 */
  gradA?: string;
  gradB?: string;
  /** control / input / button face, and its hover */
  surface: string;
  surfaceHover: string;
  /** cards and raised panels */
  raised: string;
  /** recessed areas (study panel, console, text inputs) */
  deep: string;
  editorBg: string;
  syn: {
    keyword: string;
    string: string;
    number: string;
    comment: string;
    fn: string;
    type: string;
    op: string;
    meta: string;
  };
}

export const DEFAULT_THEME = "midnight";
export const THEME_STORAGE_KEY = "c-visualizer-theme";

export const THEMES: Theme[] = [
  {
    id: "midnight",
    label: "Midnight",
    kind: "dark",
    bg: "#060914",
    ink: "#e8ebf5",
    muted: "#8d95ab",
    accent: "#8b5cf6",
    accent2: "#22d3ee",
    glow3: "#ec4899",
    gradA: "#7c3aed",
    gradB: "#06b6d4",
    surface: "#23262f",
    surfaceHover: "#2c303b",
    raised: "#262830",
    deep: "#1f1f20",
    editorBg: "#1d202a",
    syn: { keyword: "#c678dd", string: "#98c379", number: "#d19a66", comment: "#5c6370", fn: "#61afef", type: "#e5c07b", op: "#56b6c2", meta: "#e06c75" },
  },
  {
    id: "one-dark",
    label: "One Dark",
    kind: "dark",
    bg: "#1b1f27",
    ink: "#c8ccd4",
    muted: "#7f848e",
    accent: "#61afef",
    accent2: "#56b6c2",
    glow3: "#c678dd",
    gradA: "#3b82c4",
    gradB: "#3a9aa6",
    surface: "#2c313a",
    surfaceHover: "#353b45",
    raised: "#282c34",
    deep: "#21252b",
    editorBg: "#282c34",
    syn: { keyword: "#c678dd", string: "#98c379", number: "#d19a66", comment: "#5c6370", fn: "#61afef", type: "#e5c07b", op: "#56b6c2", meta: "#e06c75" },
  },
  {
    id: "dracula",
    label: "Dracula",
    kind: "dark",
    bg: "#191a21",
    ink: "#f8f8f2",
    muted: "#8f93b0",
    accent: "#bd93f9",
    accent2: "#8be9fd",
    glow3: "#ff79c6",
    gradA: "#8f5fe0",
    gradB: "#d0569f",
    surface: "#343746",
    surfaceHover: "#3e4156",
    raised: "#2d2f3d",
    deep: "#21222c",
    editorBg: "#282a36",
    syn: { keyword: "#ff79c6", string: "#f1fa8c", number: "#bd93f9", comment: "#6272a4", fn: "#50fa7b", type: "#8be9fd", op: "#ff79c6", meta: "#ffb86c" },
  },
  {
    id: "monokai",
    label: "Monokai",
    kind: "dark",
    bg: "#1b1c18",
    ink: "#f8f8f2",
    muted: "#908e80",
    accent: "#a6e22e",
    accent2: "#66d9ef",
    glow3: "#f92672",
    gradA: "#e0245e",
    gradB: "#8f5fe0",
    surface: "#3e3d32",
    surfaceHover: "#49483e",
    raised: "#35352e",
    deep: "#212220",
    editorBg: "#272822",
    syn: { keyword: "#f92672", string: "#e6db74", number: "#ae81ff", comment: "#75715e", fn: "#a6e22e", type: "#66d9ef", op: "#f92672", meta: "#fd971f" },
  },
  {
    id: "nord",
    label: "Nord",
    kind: "dark",
    bg: "#242933",
    ink: "#eceff4",
    muted: "#8a94a8",
    accent: "#88c0d0",
    accent2: "#81a1c1",
    glow3: "#b48ead",
    gradA: "#5e81ac",
    gradB: "#4c8aa0",
    surface: "#3b4252",
    surfaceHover: "#434c5e",
    raised: "#2e3440",
    deep: "#272c36",
    editorBg: "#2e3440",
    syn: { keyword: "#81a1c1", string: "#a3be8c", number: "#b48ead", comment: "#616e88", fn: "#88c0d0", type: "#8fbcbb", op: "#81a1c1", meta: "#d08770" },
  },
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    kind: "dark",
    bg: "#13141f",
    ink: "#c0caf5",
    muted: "#7a82ab",
    accent: "#7aa2f7",
    accent2: "#7dcfff",
    glow3: "#bb9af7",
    gradA: "#3d59a1",
    gradB: "#1f9fbf",
    surface: "#292e42",
    surfaceHover: "#343a55",
    raised: "#1f2335",
    deep: "#16161e",
    editorBg: "#1a1b26",
    syn: { keyword: "#bb9af7", string: "#9ece6a", number: "#ff9e64", comment: "#565f89", fn: "#7aa2f7", type: "#2ac3de", op: "#89ddff", meta: "#7dcfff" },
  },
  {
    id: "solarized-dark",
    label: "Solarized Dark",
    kind: "dark",
    bg: "#001f27",
    ink: "#aebcbc",
    muted: "#7f9499",
    accent: "#268bd2",
    accent2: "#2aa198",
    glow3: "#d33682",
    surface: "#0a3a47",
    surfaceHover: "#114858",
    raised: "#073642",
    deep: "#00252f",
    editorBg: "#002b36",
    syn: { keyword: "#859900", string: "#2aa198", number: "#d33682", comment: "#586e75", fn: "#268bd2", type: "#b58900", op: "#859900", meta: "#cb4b16" },
  },
  {
    id: "high-contrast",
    label: "High Contrast",
    kind: "dark",
    bg: "#000000",
    ink: "#ffffff",
    muted: "#c0c0c0",
    accent: "#ffd700",
    accent2: "#00ffff",
    glow3: "#ffffff",
    gradA: "#0050c8",
    gradB: "#007a7a",
    surface: "#1a1a1a",
    surfaceHover: "#2e2e2e",
    raised: "#0f0f0f",
    deep: "#000000",
    editorBg: "#000000",
    syn: { keyword: "#569cd6", string: "#ce9178", number: "#b5cea8", comment: "#7ca668", fn: "#dcdcaa", type: "#4ec9b0", op: "#d4d4d4", meta: "#c586c0" },
  },
  {
    id: "github-light",
    label: "GitHub Light",
    kind: "light",
    bg: "#f6f8fa",
    ink: "#1f2328",
    muted: "#656d76",
    accent: "#0969da",
    accent2: "#1b7c83",
    glow3: "#8250df",
    surface: "#ffffff",
    surfaceHover: "#eaeef2",
    raised: "#ffffff",
    deep: "#f0f2f5",
    editorBg: "#ffffff",
    syn: { keyword: "#cf222e", string: "#0a3069", number: "#0550ae", comment: "#6e7781", fn: "#8250df", type: "#953800", op: "#0550ae", meta: "#cf222e" },
  },
  {
    id: "one-light",
    label: "One Light",
    kind: "light",
    bg: "#f0f0f1",
    ink: "#383a42",
    muted: "#696c77",
    accent: "#4078f2",
    accent2: "#0184bc",
    glow3: "#a626a4",
    surface: "#ffffff",
    surfaceHover: "#e5e5e6",
    raised: "#fafafa",
    deep: "#eaeaeb",
    editorBg: "#fafafa",
    syn: { keyword: "#a626a4", string: "#50a14f", number: "#986801", comment: "#a0a1a7", fn: "#4078f2", type: "#c18401", op: "#0184bc", meta: "#e45649" },
  },
  {
    id: "solarized-light",
    label: "Solarized Light",
    kind: "light",
    bg: "#fdf6e3",
    ink: "#073642",
    muted: "#657b83",
    accent: "#268bd2",
    accent2: "#2aa198",
    glow3: "#d33682",
    surface: "#eee8d5",
    surfaceHover: "#e6dfc8",
    raised: "#f5eedb",
    deep: "#eee8d5",
    editorBg: "#fdf6e3",
    syn: { keyword: "#859900", string: "#2aa198", number: "#d33682", comment: "#93a1a1", fn: "#268bd2", type: "#b58900", op: "#657b83", meta: "#cb4b16" },
  },
];

export const THEME_IDS: string[] = THEMES.map((t) => t.id);

export function isThemeId(id: string | null | undefined): id is string {
  return !!id && THEME_IDS.includes(id);
}

export function themeById(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/**
 * The UI is written against Tailwind's dark palette (`text-cyan-200`, `text-amber-200`, …), which
 * is unreadable on a light page. Light themes swap those shades for darker ones of the same hue.
 */
const LIGHT_HUES: Record<string, Record<string, string>> = {
  cyan: { 100: "#155e75", 200: "#0e7490", 300: "#0e7490" },
  amber: { 200: "#92400e", 300: "#b45309" },
  red: { 100: "#991b1b", 200: "#b91c1c", 300: "#dc2626" },
  emerald: { 200: "#047857", 300: "#059669" },
  violet: { 200: "#5b21b6", 300: "#6d28d9" },
  teal: { 200: "#0f766e", 300: "#0f766e" },
  sky: { 100: "#075985", 200: "#0369a1" },
  fuchsia: { 200: "#a21caf" },
};

function declarations(t: Theme): string {
  const d: Record<string, string> = {
    "color-scheme": t.kind,
    "--bg": t.bg,
    "--ink": t.ink,
    "--text": t.ink,
    "--muted": t.muted,
    "--accent": t.accent,
    "--accent-2": t.accent2,
    "--glow-1": t.accent,
    "--glow-2": t.accent2,
    "--glow-3": t.glow3,
    "--grad-a": t.gradA ?? t.accent,
    "--grad-b": t.gradB ?? t.accent2,
    // gradient title: a lighter tint on dark pages, a deeper shade on light ones
    "--title-a": `color-mix(in srgb, ${t.accent} ${t.kind === "dark" ? 60 : 85}%, ${t.kind === "dark" ? "white" : "black"})`,
    "--title-b": `color-mix(in srgb, ${t.accent2} ${t.kind === "dark" ? 60 : 85}%, ${t.kind === "dark" ? "white" : "black"})`,
    "--surface": t.surface,
    "--surface-hover": t.surfaceHover,
    "--raised": t.raised,
    "--deep": t.deep,
    "--editor-bg": t.editorBg,
    "--glow-strength": t.kind === "dark" ? "1" : "0.55",
    "--shadow-strength": t.kind === "dark" ? "1" : "0.35",
    // every `white` utility in the UI means "ink"
    "--color-white": t.ink,
    "--line-alpha": t.id === "high-contrast" ? "34%" : t.kind === "dark" ? "10%" : "14%",
    "--syn-keyword": t.syn.keyword,
    "--syn-string": t.syn.string,
    "--syn-number": t.syn.number,
    "--syn-comment": t.syn.comment,
    "--syn-fn": t.syn.fn,
    "--syn-type": t.syn.type,
    "--syn-op": t.syn.op,
    "--syn-meta": t.syn.meta,
  };
  if (t.kind === "light") {
    for (const [hue, shades] of Object.entries(LIGHT_HUES)) {
      for (const [shade, hex] of Object.entries(shades)) d[`--color-${hue}-${shade}`] = hex;
    }
  }
  return Object.entries(d)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}

/** CSS for every theme; the default theme also applies when `data-theme` is missing. */
export function themesCss(): string {
  return THEMES.map((t) => {
    const sel = t.id === DEFAULT_THEME ? `:root,html[data-theme="${t.id}"]` : `html[data-theme="${t.id}"]`;
    return `${sel}{${declarations(t)}}`;
  }).join("\n");
}

/** Runs before first paint so a saved theme never flashes the default one. */
export const themeInitScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(${JSON.stringify(THEME_IDS)}.indexOf(t)>-1)document.documentElement.dataset.theme=t}catch(e){}`;
