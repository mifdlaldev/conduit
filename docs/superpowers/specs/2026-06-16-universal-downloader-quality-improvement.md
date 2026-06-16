# Universal Downloader — Development Quality Improvement

**Date:** 2026-06-16
**Status:** Approved (verbal)

---

## 1. Problem Statement

The project functions correctly as an MVP but has gaps that prevent it from being a strong engineering portfolio piece:

- **Zero tests** — no unit, integration, or E2E coverage
- **Code quality debt** — empty catch blocks, `any` types, console.log scattering, 690-line monolithic file
- **No developer tooling** — no Docker Compose, no pre-commit hooks, no env validation
- **Loose security** — CORS wildcard, download endpoint unprotected, stack traces exposed

**Non-goal:** Adding new features, providers, or changing existing API contracts/UI behavior.

---

## 2. Architecture (Post-Restructure)

```
backend/src/
├── index.ts                 → Express app setup (unchanged flow)
├── config.ts                → [NEW] Zod-validated environment config
├── logger.ts                → [NEW] Pino structured logger
│
├── extractor/
│   ├── index.ts             → [NEW] Re-export all public extractor APIs
│   ├── browser.ts           → [NEW] Playwright launch/context/page lifecycle
│   ├── helpers.ts           → [NEW] Utility functions (filename, headers, detection)
│   ├── media-candidate.ts   → [NEW] Scoring algorithm + candidate selection
│   ├── schemas.ts           → [NEW] Zod schemas + validation errors
│   ├── errors.ts            → [NEW] Custom error classes
│   ├── routes.ts            → [NEW] Express route handlers (extract + download)
│   └── providers/
│       └── videy.ts         → [NEW] Videy direct URL resolution
│
├── __tests__/
│   ├── setup.ts             → [NEW] Test mocks (Playwright, fetch, logger)
│   ├── helpers.test.ts      → [NEW] Unit: utility functions
│   ├── media-candidate.test.ts → [NEW] Unit: scoring algorithm
│   ├── schemas.test.ts      → [NEW] Unit: URL validation
│   ├── routes.test.ts       → [NEW] Integration: HTTP handlers
│   └── browser.test.ts      → [NEW] Integration: Playwright extraction (mocked)
│
└── test_extract.ts          → [REMOVED] Replaced by tests
└── src/test_playvvip.ts     → [REMOVED] Replaced by tests
```

### Key Changes from Current Code

| Current | After |
|---------|-------|
| `extractor.ts` (690 lines, mixed concerns) | `extractor/` directory (7 files, single responsibility each) |
| `console.log()` scattered | `logger.info()`, `logger.error()` |
| `catch { }` empty | `catch (err) { logger.error(...) }` or throw typed error |
| `error: any` | `error: unknown` + type guard |
| Env vars via `||` | Zod schema validated at startup |
| No tests | Vitest with ~40 test cases |

---

## 3. Detailed Changes by Phase

### Phase 1 — Testing

**Framework:** Vitest (already compatible with TypeScript, fast)
**Config:** `backend/vitest.config.ts`

**Test Plan:**

| Test Suite | File | Type | Test Cases |
|---|---|---|---|
| Helpers | `helpers.test.ts` | Unit | `extractVideyId`, `sanitizeFilename`, `getSuggestedFilename`, `hasDirectMediaExtension`, `isLikelyAdOrTrackerHost`, `isSameOrigin`, `detectProvider`, `encodeHeaders`/`decodeHeaders`, `buildProxyDownloadUrl`, `sanitizeCapturedHeaders` |
| Media Candidate | `media-candidate.test.ts` | Unit | `buildMediaCandidateScore` (all heuristics), `pickBetterCandidate`, `isLikelyMediaResponse`, `isLikelyPlayerFrame` |
| Schemas | `schemas.test.ts` | Unit | `extractSchema` valid/invalid URLs, `downloadQuerySchema` |
| Router | `routes.test.ts` | Integration | POST `/` dengan valid/invalid body, error mapping (400/404/503/500), GET `/download` sukses/gagal |
| Browser | `browser.test.ts` | Integration | `ensureChromiumInstalled` (installed/not), launch/close lifecycle |

**Edge cases to cover:**
- URLs from unsupported domains → 400
- Videy URL with `?id=` and without
- Ad tracker URLs → should never be selected
- Same-origin vs cross-origin candidates
- Player frame path detection (`/playvid`, `/embed`, etc.)
- Content-type header variations
- Missing browser installation → 503
- Range request passthrough
- Upstream fetch failure → 502

**Mock strategy:**
- `playwright` module: mock `chromium.launch`, `browser.newContext`, `page.goto`, `page.waitForTimeout`, `page.title`, `page.frames`
- `global.fetch`: mock for download proxy
- Filesystem: mock `fs.promises.access` for `ensureChromiumInstalled`

### Phase 2 — Code Quality

#### a. File Restructuring

**`config.ts`:**
```typescript
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ALLOWED_ORIGINS: z.string().default('*'),  // comma-separated in production
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().default(5),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
```

**`logger.ts`:**
```typescript
import pino from 'pino';
import { env } from './config';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: env.NODE_ENV === 'development' 
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});
```

**`extractor/errors.ts`:**
```typescript
export class ExtractError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code?: string,
    public readonly debug?: string[],
  ) {
    super(message);
    this.name = 'ExtractError';
  }
}

export class BrowserMissingError extends ExtractError {
  constructor() {
    super('Playwright Chromium is not installed. Run "npm run playwright:install"', 503, 'PLAYWRIGHT_BROWSER_MISSING');
    this.name = 'BrowserMissingError';
  }
}

export class NoMediaFoundError extends ExtractError {
  constructor(debug?: string[]) {
    super('Failed to extract video stream from the provided URL.', 404, 'NO_MEDIA_FOUND', debug);
    this.name = 'NoMediaFoundError';
  }
}
```

#### b. Anti-Pattern Fixes

**Empty catch blocks** (current line 369, 508):
```typescript
// Before
catch {
  // Ignore cross-frame evaluation failures
}

// After
catch (err) {
  logger.debug({ err, frameUrl }, 'Failed to evaluate frame for media sources');
}
```

**`error: any` type:**
```typescript
// Before
catch (error: any) {
  const debug = error?.debug;

// After
catch (error: unknown) {
  const debug = error instanceof ExtractError ? error.debug : undefined;
```

#### c. Console.log → Logger
All 12+ `console.log` calls replaced with appropriate logger level (`logger.info`, `logger.debug`, `logger.warn`, `logger.error`).

### Phase 3 — Developer Experience

**`docker-compose.yml`** (root level):
```yaml
services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=development
      - PORT=3001
    volumes:
      - ./backend/src:/app/src
    command: npx tsx watch src/index.ts
  
  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
    environment:
      - VITE_BACKEND_URL=http://localhost:3001
    volumes:
      - ./frontend/src:/app/src
    depends_on:
      - backend
```

**`.env.example`** (root level):
```env
# Backend
PORT=3001
NODE_ENV=development
ALLOWED_ORIGINS=*
LOG_LEVEL=info

# Frontend
VITE_BACKEND_URL=http://localhost:3001
```

### Phase 4 — Security Hardening

**CORS:**
```typescript
const allowedOrigins = env.ALLOWED_ORIGINS === '*' 
  ? '*' 
  : env.ALLOWED_ORIGINS.split(',').map(s => s.trim());

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
}));
```

**Rate limit on download endpoint:**
```typescript
app.use('/api/v1/extract/download', limiter, downloadRouter);
```

**Error response sanitization:**
```typescript
// Global error handler — NO stack trace in response
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error({ err, requestId: req.id }, 'Unhandled error');
  
  const statusCode = err instanceof ExtractError ? err.statusCode : 500;
  const message = statusCode === 500 ? 'Internal Server Error' : err.message;
  
  res.status(statusCode).json({
    meta: { status: statusCode, message },
    data: null,
    error: message,
  });
});
```

---

## 4. Testing Strategy

```
                          ┌─────────────────────┐
                          │    Test Pyramid      │
                          │                      │
                          │   few / slow / cost  │
                          │   ┌───────────┐      │
                          │   │  E2E (0)  │      │
                          │   ├───────────┤      │
                          │   │ Integration│     │
                          │   │ ~10 tests  │     │
                          │   ├───────────┤      │
                          │   │   Unit     │     │
                          │   │  ~30 tests │     │
                          │   │   fast     │     │
                          │   └───────────┘      │
                          │ many / fast / cheap   │
                          └─────────────────────┘
```

- **No E2E tests** — tidak ada browser UI untuk di-test (frontend terlalu sederhana)
- **Integration tests** — mock Playwright, test HTTP request/response cycle
- **Unit tests** — pure functions, scoring algorithm, helpers

**Coverage target:** > 80% line coverage on `extractor/` directory.

---

## 5. Error Handling Matrix

| Condition | Status Code | Response Message | Error Code |
|---|---|---|---|
| Invalid URL format | 400 | Validation Error | Zod issues |
| Unsupported domain | 400 | Validation Error | Zod issues |
| Playwright not installed | 503 | Service Unavailable | `PLAYWRIGHT_BROWSER_MISSING` |
| No media found | 404 | Not Found | `NO_MEDIA_FOUND` |
| Upstream download failed | 502 | Bad Gateway | - |
| Unknown error | 500 | Internal Server Error | - |
| Rate limited | 429 | Too Many Requests | - |

---

## 6. Non-Goals (Out of Scope)

- Adding new video providers
- Changing API response shape
- Modifying frontend UI behavior
- Adding authentication/authorization
- Adding database or persistence
- CI/CD pipeline (will be done in separate GitHub/portfolio phase)
- Documentation/README (will be done in separate phase)

---

## 7. Dependencies to Add

**Dev:**
- `vitest` — test runner
- `pino` + `pino-pretty` — structured logging
- `husky` + `lint-staged` — pre-commit hooks

No production dependency changes. All existing functionality preserved.
