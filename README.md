# C Visualizer

An interactive C visualizer for beginners. Type C code and press **Start Visualizer**: a built-in C interpreter runs your
program in the browser and draws memory step by step: arrays as boxes, pointers as arrows/tags, structs as tables,
stack vs heap, plus plain-English explanations for every step. AI is optional and used only for autocomplete,
one-click fixes and code generation.

Built with Next.js (App Router) · Tailwind · CodeMirror.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional: add an AI key (see below)
npm run dev
```

- Groq key: https://console.groq.com/keys
- Gemini key: https://aistudio.google.com/apikey

The visualizer works with no keys at all. Keys only enable the AI features; the app tries each configured provider in turn (Groq, Cerebras, Gemini, OpenRouter).

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. In Vercel: **Add New → Project →** import the repo (framework auto-detected as Next.js).
3. Under **Environment Variables** add any AI keys you use (`GROQ_API_KEY`, `GEMINI_API_KEY`, `CEREBRAS_API_KEY`, `OPENROUTER_API_KEY`). None are required for the visualizer itself.
4. Deploy. (Or: `npx vercel` then `npx vercel env add GROQ_API_KEY`.)

API keys stay server-side in the `app/api/*` routes; they are never sent to the browser.

## Learning features

- **Study panel** (under the explanation): *Lesson* (idea, key concepts, what to watch, pitfalls, experiments, complexity for every example),
  *Trace table* (a hand-style dry run of every variable; click a row to jump), *Predict* (guess the next value or whether a condition is true, with a score),
  and *Stats* (steps, calls, stack depth, heap use, busiest lines).
- **Run counts in the editor**: tick "Show run counts" in Stats to see how often each line has executed so far (spot O(n²) loops).
- **Timeline scrubber** with coloured calls/conditions/returns, and click any line in the editor to jump to its next execution.
- **Example gallery** (Browse): searchable, filtered by topic and level, including algorithms, data structures and bug examples.
- **Autocomplete**: instant C keyword/snippet/library completions, plus **AI ghost-text suggestions** (pause typing, press Tab to accept, Esc to dismiss).
  Toggle it in the header. It uses `/api/complete` with `GROQ_API_KEY` / `GEMINI_API_KEY`; see `.env.example` for tuning variables.
- **Live error checking** (like VS Code): syntax errors are underlined in red as you type (missing `;`, `)`, `"`, unclosed `{`, stray characters),
  with a status badge in the header. Hover the red marker for the message and a one-click fix (e.g. *Insert ';'*) or **✨ Fix with AI**, which rewrites the
  line and explains the mistake (`/api/fix`). Amber warnings catch a missing `#include` and `=` used instead of `==` in a condition.

## Checks

| Command | What it does |
| --- | --- |
| `npm run lint` | ESLint, zero warnings allowed |
| `npm run typecheck` | TypeScript |
| `npm test` | Vitest unit tests. The gcc comparison test is skipped when `gcc` is not installed |
| `npm run build` | Production build |
| `npm run e2e` | Playwright browser tests. Needs Google Chrome installed; builds and serves the app on port 3123 |

## AI features

- **Autocomplete**: pause typing for ghost-text; Tab accepts, Esc dismisses (`/api/complete`).
- **Fix with AI**: hover an error and use the quick fix (`/api/fix`).
- **`/ai <request>`**: type e.g. `/ai sort an array with bubble sort` and press Enter. The whole editor is replaced by the generated program (`/api/generate`). Esc cancels while waiting and Ctrl+Z undoes it.

Environment variables are documented in `.env.example`.

## How it works

- `lib/c/` – the in-browser C interpreter (`lexer.ts`, `parser.ts`, `interp.ts`) that records a snapshot of memory at every step.
- `components/MemoryView.tsx` / `ValueView.tsx` – draw each step's memory (stack, heap, arrays, pointers).
- `components/StepPlayer.tsx`, `Scrubber.tsx`, `Console.tsx`, `StudyPanel.tsx` – playback controls, timeline, program output and learning tools.
- `components/CodeEditor.tsx` / `editorExtras.ts` – CodeMirror editor, live diagnostics, AI ghost text and `/ai`.
- `app/page.tsx` – ties the editor, interpreter and player together.
