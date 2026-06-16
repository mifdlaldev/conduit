# Universal Downloader — Quality Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform project from MVP to production-grade quality — tests, code structure, logging, dev tooling, security hardening.

**Architecture:** Monorepo with `backend/` (Express + Playwright) and `frontend/` (React + Vite). Backend core logic split from monolithic 690-line `extractor.ts` into focused modules under `extractor/` directory. All key functions covered by Vitest tests. Pino replaces console.log. Zod validates all env config.

**Tech Stack:** TypeScript (strict), Vitest, Pino, Zod, Docker Compose, Husky, lint-staged

---

## File Structure (Target State)

```
backend/
├── vitest.config.ts                    [NEW]
├── package.json                        [MODIFY: deps]
├── src/
│   ├── index.ts                        [MODIFY: use config/logger/new routes]
│   ├── config.ts                       [NEW: Zod env validation]
│   ├── logger.ts                       [NEW: Pino logger]
│   ├── extractor/
│   │   ├── index.ts                    [NEW: re-export]
│   │   ├── browser.ts                  [NEW: Playwright lifecycle]
│   │   ├── errors.ts                   [NEW: custom error classes]
│   │   ├── helpers.ts                  [NEW: utility functions + scoring]
│   │   ├── schemas.ts                  [NEW: Zod schemas]
│   │   ├── routes.ts                   [NEW: route handlers]
│   │   └── providers/
│   │       └── videy.ts                [NEW: videy direct resolve]
│   └── __tests__/
│       ├── setup.ts                    [NEW: mocks]
│       ├── helpers.test.ts             [NEW: unit tests]
│       ├── media-candidate.test.ts     [NEW: unit tests]
│       ├── schemas.test.ts             [NEW: unit tests]
│       └── routes.test.ts              [NEW: integration tests]
├── .husky/
│   └── pre-commit                      [NEW]
├── docker-compose.yml                  [NEW]
└── .env.example                        [NEW]
```

**Files to REMOVE:**
- `backend/src/extractor.ts`
- `backend/src/test_extract.ts`
- `backend/src/test_playvvip.ts`

---

## Task 1: Dependencies & Config files

**Files:** Modify `backend/package.json`, Create `backend/src/config.ts`, `backend/src/logger.ts`, `backend/vitest.config.ts`

Steps:
1. Add vitest, pino, pino-pretty, husky, lint-staged to devDependencies; pino to dependencies
2. Run `npm install`
3. Create `config.ts` with Zod env validation (PORT, NODE_ENV, ALLOWED_ORIGINS, RATE_LIMIT_*, LOG_LEVEL)
4. Create `logger.ts` with Pino instance (pretty-print in dev)
5. Create `vitest.config.ts` with globals, coverage thresholds (80% line, 70% branch)
6. Add test scripts to package.json
7. Commit: `chore: add vitest, pino, husky, lint-staged deps and config files`

---

## Task 2: Custom Error Classes

**File:** Create `backend/src/extractor/errors.ts`

Classes: `ExtractError` (base, with statusCode, code, debug), `BrowserMissingError` (503), `NoMediaFoundError` (404), `UpstreamFetchError` (502), `ValidationError` (400).

Commit: `feat: add custom ExtractError classes with typed status codes`

---

## Task 3: Test Setup

**File:** Create `backend/src/__tests__/setup.ts`

Mock pino to avoid transport issues in tests. Export nothing — just global mock setup.

Commit: `test: add vitest setup with pino mock`

---

## Task 4: Update Main Entry Point

**File:** Modify `backend/src/index.ts`

Changes:
- Import `env` from config.ts, `logger` from logger.ts
- Import `extractRouter` from `extractor/routes`
- Use `env.PORT` instead of `process.env.PORT || 3001`
- CORS: use `env.ALLOWED_ORIGINS` (supports comma-separated)
- Global error handler: check `instanceof ExtractError`, log stack, return generic message
- Only one try-catch at top level (Express error handler catches the rest)

Commit: `refactor: update main entry to use config, logger, and new extractor structure`

---

## Task 5: Helper Functions Module

**File:** Create `backend/src/extractor/helpers.ts`

Extract from original `extractor.ts`:
- Constants: `browserUserAgent`, `directMediaExtensions`, `mediaContentTypeMarkers`, `adTrackerHostSuffixes`, `adTrackerHostKeywords`, `allowedHostSuffixes`
- Pure functions: `sanitizeFilename`, `getSuggestedFilename`, `encodeHeaders`, `decodeHeaders`, `buildProxyDownloadUrl`, `detectProvider`, `hasDirectMediaExtension`, `isLikelyMediaContentType`, `isLikelyAdOrTrackerHost`, `isSameOrigin`, `isLikelyPlayerFrame`, `sanitizeCapturedHeaders`, `isLikelyMediaResponse`
- Scoring: `buildMediaCandidateScore`, `pickBetterCandidate`, type `MediaCandidate`

Commit: `refactor: extract helpers and scoring logic into dedicated module`

---

## Task 6: Provider, Browser, and Schemas Modules

**Files:** Create `backend/src/extractor/providers/videy.ts`, `backend/src/extractor/browser.ts`, `backend/src/extractor/schemas.ts`

**videy.ts:** `extractVideyId`, `buildVideyDirectDownloadUrl`, `getDirectExtractResult`

**browser.ts:** `ensureChromiumInstalled` (throws BrowserMissingError), `launchBrowser`, `collectDomMediaCandidates` (empty catch → logger.debug), `extractWithBrowser` (console.log → logger.info/debug, empty catch preserved with comment since it's benign third-party URL skip, error: unknown → instanceof checks)

**schemas.ts:** `extractSchema` (URL validation against allowedHostSuffixes), `downloadQuerySchema` (source URL + optional filename + required headers)

Commit: `refactor: extract browser lifecycle, videy provider, and schemas into modules`

---

## Task 7: Routes Module

**Files:** Create `backend/src/extractor/routes.ts`, `backend/src/extractor/index.ts`

**routes.ts:** 
- POST `/`: validate → direct videy check → browser extraction → return result
- GET `/download`: validate → decode headers → fetch upstream → stream response
- Both handlers use `try/catch` with `error: unknown` + `instanceof ExtractError`
- No stack trace in error responses; logger gets the full error
- Uses `ValidationError` for Zod failures

**index.ts:** `export { extractRouter } from "./routes"`

Commit: `refactor: extract route handlers into dedicated module`

---

## Task 8: Remove Old Files & Build Verification

Files to delete: `backend/src/extractor.ts`, `backend/src/test_extract.ts`, `backend/src/test_playvvip.ts`

Run `npx tsc --noEmit` — expect exit 0.

Commit: `refactor: remove monolithic extractor.ts and test scripts (split into modules)`

---

## Task 9: Unit Tests — Helpers

**File:** Create `backend/src/__tests__/helpers.test.ts`

Test cases (12-15 tests):
1. `sanitizeFilename`: normal, special chars, empty
2. `extractVideyId`: valid videy.co, cdn.videy.co, non-videy, missing param
3. `hasDirectMediaExtension`: .mp4=true, .m3u8=true, .html=false, invalid URL
4. `detectProvider`: videy, playvvip, fwh, unknown
5. `isLikelyAdOrTrackerHost`: doubleclick=true, analytics=true, example.com=false
6. `isSameOrigin`: same, different, null
7. `isLikelyPlayerFrame`: /playvid=true, /embed=true, /api=false
8. `sanitizeCapturedHeaders`: removes blocked, adds UA
9. `encodeHeaders`/`decodeHeaders`: round-trip

Run: `npx vitest run src/__tests__/helpers.test.ts`

Commit: `test: add unit tests for helper functions`

---

## Task 10: Unit Tests — Media Candidate Scoring

**File:** Create `backend/src/__tests__/media-candidate.test.ts`

Test cases (10-12 tests):
1. `buildMediaCandidateScore`: ad tracker (-1000), DOM source (+500), media type (+500), video content-type (+400), direct extension (+250), same origin (-150), cross-origin + no ext (+200), player frame (+220)
2. `pickBetterCandidate`: null → next, higher score wins, same score + more headers wins
3. `isLikelyMediaResponse`: media type, extension match, content-type match, no match

Run: `npx vitest run src/__tests__/media-candidate.test.ts`

Commit: `test: add unit tests for media candidate scoring algorithm`

---

## Task 11: Unit Tests — Schemas

**File:** Create `backend/src/__tests__/schemas.test.ts`

Test cases (8-10 tests):
1. `extractSchema`: valid per-provider URLs, subdomain URLs, invalid string, unsupported domain, non-URL
2. `downloadQuerySchema`: valid, missing headers, optional filename, invalid source

Run: `npx vitest run src/__tests__/schemas.test.ts`

Commit: `test: add unit tests for Zod validation schemas`

---

## Task 12: Integration Tests — Routes

**File:** Create `backend/src/__tests__/routes.test.ts`

Mocks: playwright `chromium.launch`, `global.fetch`

Test cases (6-8 tests):
1. POST `/` with valid URL → 200 + data shape
2. POST `/` with invalid body → 400
3. POST `/` with unsupported domain → 400
4. POST `/` when no media found → 404 (mock `extractWithBrowser` to throw)
5. GET `/download` with valid params → 200 + stream
6. GET `/download` with missing params → 400
7. Rate limiting: 6 rapid requests → 429 on 6th

Run full suite: `npx vitest run` — expect all pass + coverage > 80%.

Commit: `test: add integration tests for route handlers`

---

## Task 13: Docker Compose & Environment Config

**Files:** Create `docker-compose.yml`, `.env.example`

**docker-compose.yml:** backend (build ./backend, port 3001, tsx watch, bind mount) + frontend (build ./frontend, port 5173, depends_on backend)

**.env.example:** All env vars with defaults

Commit: `chore: add docker-compose and env example for local development`

---

## Task 14: Pre-commit Hooks

Run `npx husky init` in backend/, create `.husky/pre-commit` with `npx lint-staged`, add lint-staged config to package.json (`"*.ts": ["npx tsc --noEmit"]`).

Commit: `chore: add husky pre-commit hooks with lint-staged`

---

## Task 15: Final Verification

1. `npx tsc --noEmit` — exit 0
2. `npx vitest run` — all green
3. `npx vitest run --coverage` — thresholds met
4. Server starts on port 3001 without errors

Commit: `chore: final verification — all tests pass, coverage meets thresholds`
