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
