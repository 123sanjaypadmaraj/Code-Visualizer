# Autopilot status

## Task list

- [x] **Add unit tests for LLM response parsing and step selection** — status: done
  Add Vitest as a dev dependency with an `npm test` script, and cover `parseAnalysis`/`cleanVar` in `lib/llm.ts` (JSON wrapped in prose/markdown fences, missing/invalid fields, unknown `kind` falling back to `scalar`, `region` defaulting to `stack`, steps capped at 60, concepts capped at 6) plus `pickStep` (extract it from `app/page.tsx` into `lib/` first; cover exact-line match, nearest earlier line, `null` focus, empty steps). Done when `npm test` passes with these cases and `npm run lint` stays clean.

- [x] **Add per-IP rate limiting to /api/analyze** — status: done
  The public Vercel deployment lets anyone burn the server-side Groq/Gemini keys (auto-run fires on every Enter). Add a simple in-memory sliding-window limiter in `lib/rateLimit.ts` keyed by `x-forwarded-for` (default 20 requests/minute, overridable via `RATE_LIMIT_PER_MIN` env, documented in `.env.example` and README) that returns HTTP 429 with `{ error: "Too many requests, wait a moment and try again" }`; the existing error banner in `page.tsx` must show that message. Accept that it is per-instance (note this in a code comment); add a unit test for the limiter.

- [x] **Add per-provider timeout so Groq-to-Gemini fallback can actually happen** — status: done
  In `lib/llm.ts`, wrap each provider call in its own `AbortSignal.any([requestSignal, AbortSignal.timeout(PROVIDER_TIMEOUT_MS)])` (default 25000 ms, env override `LLM_TIMEOUT_MS`) so a hung Groq call fails fast and Gemini still runs within the route's 60s `maxDuration`. Timeout errors must read "Groq timed out after 25s" (not a raw AbortError), and a client abort must still stop immediately without trying the next provider.

- [x] **Persist editor code locally and add a shareable link** — status: done
  Save the editor contents to `localStorage` (debounced ~500 ms) and restore them on load instead of always showing `STARTER`; add a "Share" header button that copies a URL with the code encoded in the hash (`#code=` + base64url of UTF-8) and, when such a hash is present on load, load that code (taking priority over localStorage) and run it once. Add a "Reset" option to the examples dropdown that restores the starter program.

- [x] **Improve accessibility and keyboard control of the step player** — status: done
  Add Left/Right arrow (prev/next) and Space (play/pause) shortcuts that are active only when focus is not inside the CodeMirror editor; give the Prev/Play/Next buttons and slider `aria-label`s, wrap the current step title+explanation in an `aria-live="polite"` region, and respect `prefers-reduced-motion` in `components/Visualizer.tsx` (use framer-motion's `useReducedMotion` to disable scale/color flashes). Done when all player controls are operable by keyboard alone and lint passes.

- [x] **Fix .env.example being git-ignored and add a CI workflow** — status: done
  `.gitignore` has `.env*`, which also ignores `.env.example`, so the README's `cp .env.example .env.local` step breaks on a fresh clone; add `!.env.example`. Add a `typecheck` script (`tsc --noEmit`) and `.github/workflows/ci.yml` that runs `npm ci`, `npm run lint`, `npm run typecheck`, and `npm test` (if the test task has landed; otherwise omit that step) on push and pull requests to `main` using Node 20.

- [x] **Remove the dead AI-trace endpoint `/api/analyze` and its code** — status: done
  `app/page.tsx` now traces locally with `runC` from `lib/c/interp.ts` and never calls `/api/analyze`, but the route is still deployed and lets anyone spend server keys on 8000-token Groq/Gemini calls. Delete `app/api/analyze/route.ts`, `lib/llm.ts`, `lib/prompt.ts`, `lib/types.ts`, `lib/steps.ts`, `tests/llm.test.ts`, `tests/steps.test.ts` (first confirm with grep that nothing outside this set imports them; keep any file that is still imported), and remove `GROQ_MODEL`/`GEMINI_MODEL`/`RATE_LIMIT_PER_MIN`/`LLM_TIMEOUT_MS` from `.env.example` and README only if no remaining code reads them. Done when `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` pass.

- [x] **Fix the corrupted README tail and rewrite "How it works"** — status: done
  `README.md` ends with a UTF-16 line (`# C o d e - V i s u a l i z e r` with NUL bytes, which makes git treat the file as binary); remove those bytes so the file is plain UTF-8 and `git diff` shows it as text. Rewrite the intro, "How it works" and the closing note to match the code: tracing is done by the in-browser interpreter in `lib/c/` (lexer/parser/interp), memory is drawn by `components/MemoryView.tsx`/`ValueView.tsx` (`components/Visualizer.tsx` no longer exists), and AI is used only for `/api/complete` (ghost text), `/api/fix` (Fix with AI) and `/api/generate` (typing `/ai <request>` + Enter replaces the program; Esc cancels; Ctrl+Z undoes); list every env var that `.env.example` documents.

- [x] **Validate `/ai`-generated programs and retry once on a parse error** — status: done
  In `lib/generate.ts`, after `cleanGenerated`, run `parseC` from `lib/c/parser.ts` (parse only, no execution) on the result; if it throws, call the model a second time with the parser error message and line appended to the prompt, and return the second result. Return `{ code, warning }` from `generateCode` where `warning` is set when the final code still fails to parse or was truncated by `MAX_LINES`/`MAX_CHARS`; the route passes `warning` through and the editor notice in `components/editorExtras.ts` appends it (e.g. "AI code may not compile: <error>"). Add Vitest cases with `askLLM` mocked: valid first try (one call), invalid then valid (two calls, second prompt contains the error), invalid twice (code returned with warning). Build on the current uncommitted whole-program-replace changes in `lib/generate.ts`; do not revert them.

- [ ] **Run the C interpreter in a Web Worker with a cancel/timeout** — status: pending
  `runC` executes synchronously on the main thread in `start`, `submitInput` and `closeInput` in `app/page.tsx` (up to 4M ticks / 4000 snapshot steps), so heavy or looping programs freeze the whole UI. Add `lib/c/worker.ts` that receives `{ source, stdin, eof }` and posts back the `RunResult`, call it from the page via `new Worker(new URL(..., import.meta.url))` (check `node_modules/next/dist/docs/` for Next 16 worker bundling first), show a "Running..." state on the Start button, and terminate the worker after 8s with the compile-error banner showing "Your program took too long to trace — is there an infinite loop?". Keep `runC` itself unchanged so existing tests still cover it; done when lint/typecheck/test/build pass and the UI stays responsive (buttons clickable) while a `while(1){}` program is being traced.

- [ ] **Add route-handler tests and a shared rate-limit helper for the AI routes** — status: pending
  The `complete`, `fix` and `generate` routes each duplicate the `x-forwarded-for` parsing and hard-code limits (fix 20, generate 15) with no tests. Add `lib/apiGuard.ts` exporting `clientIp(req)` and `limitFromEnv(name, fallback)`, use it in all AI routes, and make the fix/generate limits overridable via `FIX_RATE_LIMIT_PER_MIN` / `GENERATE_RATE_LIMIT_PER_MIN` (documented in `.env.example`). Add `tests/routes.test.ts` that imports each route's `POST`, mocks the `lib/` call, and asserts 400 on invalid JSON, 413 on oversize input, 429 after the limit (call `resetRateLimit()` between tests), 422 on empty AI result (fix/generate), and 502 with the thrown message when the provider fails.

## Run log

### 2026-10-01 — planner run (improvement proposals)
- Surveyed: README.md, AGENTS.md, CLAUDE.md, package.json, .env.example, .gitignore, `app/page.tsx`, `app/layout.tsx`, `app/api/analyze/route.ts`, `lib/llm.ts`, `lib/prompt.ts`, `lib/types.ts`, `components/CodeEditor.tsx`, `components/Visualizer.tsx`. Grep for TODO/FIXME/XXX found none. No prior status file existed, so this file was created fresh.
- Git note: the enclosing git repo root is `C:\Users\padma\Downloads` (an unrelated Python project whose files show as deleted); this folder is entirely untracked, so there is no commit history to read for direction. Not proposing a task for it because re-initializing a repo is a user decision, not a code task; flagging it here for whoever reads this.
- Added "unit tests for parsing/step selection": the project has zero tests, and `parseAnalysis` is the trust boundary for untrusted LLM JSON.
- Added "per-IP rate limiting": API keys are server-side but the endpoint is open, and auto-run fires a request on every new line.
- Added "per-provider timeout": a hung Groq call currently uses up the whole 60s route budget, so the advertised Gemini fallback never runs.
- Added "persist code + shareable link": a refresh currently loses the student's work; sharing helps beginners ask for help.
- Added "accessibility/keyboard for step player": controls are mouse-only icon buttons, there is no live region, and animations ignore reduced-motion.
- Added ".env.example ignore fix + CI": a concrete bug in the README's setup instructions, and there is no CI at all.
- Deliberately not added: real SVG pointer arrows (README says "arrows" but only tags are drawn; it's a larger layout effort, worth revisiting after the basics above); matrix `changed`-cell highlighting and pointer-target validation (small polish, lower impact); swapping the AI trace for a real C interpreter (an epic, out of scope for one session); server-side response caching (wait until rate limiting exists and usage data justifies it).

### 2026-10-01 — autopilot run
- Picked up: unit tests, per-IP rate limiting, per-provider timeout (all in `lib/` + the API route, so verifiable without a working Next build).
- Did: extracted `pickStep` to `lib/steps.ts`; added `lib/rateLimit.ts` (20/min default, `RATE_LIMIT_PER_MIN`, 429 message shown by the existing error banner); per-provider `AbortSignal.timeout` in `lib/llm.ts` (`LLM_TIMEOUT_MS`, default 25s, "Groq timed out after 25s", client abort stops without fallback); added Vitest + `npm test` / `npm run typecheck` scripts, bumped `@types/node` to ^22 (vitest 5 peer requirement); 16 tests in `tests/`; documented env vars in `.env.example` and README.
- Results: `npm test` 16/16 pass, `npm run lint` clean, `npm run typecheck` clean.
- NOT verified: `npm run build` fails because `node_modules/next` is corrupted (a failed copy during scaffolding left files missing). Needs the user to delete `node_modules` + `.next` and reinstall; autopilot did not do this (deletion was denied).
- Git: nothing committed or branched. The enclosing repo root is `C:\Users\padma\Downloads` (an unrelated Python project), so an `autopilot/*` branch/commit there would mix unrelated work. Waiting on the user to decide (e.g. `git init` inside this folder).
- Next session: after a clean reinstall confirm `npm run build`; then pick up persist/share link, accessibility, and the `.env.example` gitignore fix + CI.

### 2026-10-01 — autopilot run 2 (user asked to finish everything and run locally)
- Did: localStorage persistence + `#code=` share link + Reset option; arrow/space shortcuts, aria labels, live region, reduced motion; `.gitignore` `!.env.example` + `.github/workflows/ci.yml`; pinned `turbopack.root` in `next.config.ts`.
- Repaired corrupted `node_modules/next` non-destructively by extracting the `next@16.3.8` tarball over it.
- Results: `npm test` 16/16, `npm run lint` clean, `npm run typecheck` clean, `npm run build` succeeds, `npm run dev` serves on http://localhost:3000 (API returns the expected "key not set" error until keys are added to `.env.local`).
- Git: still nothing committed (enclosing repo is the unrelated one at `C:\Users\padma\Downloads`); awaiting user decision. Nothing pushed or deployed.
- Next: add API keys, try real traces, tune prompt; decide on `git init` here + GitHub + Vercel.

### 2026-10-04 — planner run (improvement proposals)
- Surveyed: README.md, AGENTS.md, package.json, .env.example, CI workflow, `git log` (7 commits, latest 97aad3d; the folder now has its own repo, so the earlier git-root concern is resolved), uncommitted diff (`lib/generate.ts`, generate route, `page.tsx`, `editorExtras.ts`, `globals.css` — /ai now replaces the whole program), all four API routes, `lib/generate.ts`, `lib/rateLimit.ts`, `lib/aiReason.ts`, `lib/llm.ts` head, `app/page.tsx` run/AI wiring, `components/editorExtras.ts` (/ai, ghost text, Fix with AI), interpreter limits/builtins in `lib/c/interp.ts`, test list. No TODO/FIXME/XXX markers found.
- Context: since the last planner run the project switched from AI-generated traces to a real in-browser C interpreter (`lib/c/`), added an example gallery, lessons, diagnostics, AI autocomplete/fix/generate. Every existing task is done, so there is no pending backlog to wait on.
- Added "Remove dead /api/analyze": no caller remains, yet it is a public, rate-limited-only endpoint that spends keys on the largest LLM calls in the app.
- Added "Fix README tail + How it works": README has UTF-16 bytes appended (git shows it as binary) and still describes the AI-trace architecture and a deleted `Visualizer.tsx`.
- Added "Validate /ai output with the parser + retry once": /ai now replaces the whole program and output is silently truncated at 120 lines/4000 chars, so a broken reply wipes working code; the local parser makes a cheap check possible.
- Added "Run interpreter in a Web Worker": `runC` runs synchronously on the main thread with a 4M-tick budget, so infinite loops freeze the UI before the cap trips.
- Added "Route tests + shared rate-limit helper": three AI routes duplicate IP/limit code, two limits are hard-coded, and no route handler has tests.
- Deliberately not added: verifying "Fix with AI" results via `diagnose()` before applying and adding an abort to `/api/fix` (small polish; revisit after the route tests land); more interpreter features like compound literals/`goto` (rare in beginner code); real SVG pointer arrows (still deferred, memory view was rebuilt and should be re-evaluated against `MemoryView.tsx` first); committing the uncommitted working-tree changes (user decision, not a planner task).

### 2026-10-04 — autopilot run 3
- Picked up: remove `/api/analyze`, fix README, validate `/ai` output. Branch `autopilot/cleanup-and-ai-validate`; it also carries the earlier uncommitted whole-program `/ai` and UI-restyle work.
- Did: deleted `app/api/analyze/route.ts`, `lib/{llm,prompt,types,steps}.ts` and their two tests; dropped unused env docs; README is now clean UTF-8 and describes the interpreter/AI features. `generateCode` now parses with `parseC`, retries once with the parser error, and returns `{code, warning}`, which the editor notice shows. Added 3 mocked tests.
- Results: `npm test` 126/126, `npm run lint` 0 errors (2 old warnings), `npm run typecheck` clean, `npm run build` succeeds.
- Not pushed (needs user confirmation). Next: Web Worker for the interpreter, then route tests + shared rate-limit helper.
