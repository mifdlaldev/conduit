# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added
- Pre-commit hooks via Husky + lint-staged (auto tsc + eslint before every commit)
- Docker Compose for one-command local development (backend + frontend)
- `.env.example` with all configurable environment variables
- CI/CD badges in README

---

## [1.0.0-beta] — 2026-06-17

### Added
- Comprehensive test suite (99 tests): 70 unit, 22 schema validation, 7 integration
- Custom error hierarchy with typed status codes:
  - `ExtractError` (base), `BrowserMissingError` (503), `NoMediaFoundError` (404)
  - `UpstreamFetchError` (502), `ValidationError` (400)
- Structured logging via Pino (JSON in production, pretty-print in development)
- Zod-validated environment configuration with fail-fast startup
- Support for `silent` log level (used during tests)

### Changed
- **Massive refactor:** Monolithic `extractor.ts` (690 lines) split into 9 focused modules:
  - `browser.ts` — Playwright lifecycle management
  - `helpers.ts` — Pure utility functions (17 functions)
  - `schemas.ts` — Zod validation schemas
  - `routes.ts` — Express route handlers
  - `errors.ts` — Custom error classes
  - `providers/videy.ts` — Videy.co direct URL resolver
- All `console.log` replaced with structured Pino logging
- All `error: any` replaced with `error: unknown` + `instanceof` pattern
- All empty catch blocks addressed (logged or documented as intentional)
- Main entry point (`index.ts`) now uses config/logger modules
- CORS configurable via `ALLOWED_ORIGINS` environment variable
- Global error handler no longer leaks stack traces to clients
- Rate limiting applied to both extract and download endpoints

### Removed
- `src/extractor.ts` (monolithic file, split into modules)
- `src/test_extract.ts`, `src/test_playvvip.ts` (obsolete test scripts, replaced by Vitest suite)

### Fixed
- `ReadableStream` type cast eliminated (uses `Readable.from()` directly)
- Test environment variable loading order (moved from `beforeAll` to Vitest `env` config)
- Coverage provider version aligned with Vitest
- Zod schema refine callback now handles malformed strings gracefully

---

## [0.1.0] — 2026-03-16

### Added
- Initial extraction engine using Playwright headless Chromium
- Support for `videqs.download` URLs
- Media candidate scoring algorithm (15+ heuristics)
- Ad tracker filtering (20+ blacklisted domains)
- Proxy download endpoint with range request support
- Security middleware: Helmet, CORS, rate limiting (5 req/min)
- Input validation via Zod
- Express 5 API with `/api/v1/extract` and `/api/v1/extract/download`
- React 19 frontend with Tailwind CSS and shadcn/ui
- Dark theme UI with video extraction form
- Docker deployment config for Render.com

### Changed
- Multiple Playwright user-agent adjustments to avoid bot detection
- Network interception strategy: `networkidle` + response events for iframe redirects
- URL pathname strict checking to prevent ad network extraction

### Added (in later patch commits)
- Support for `playvvip.top` extraction
- Debug URL tracking for 404 responses
- Docker sandbox arguments for Playwright

---

## [0.0.1] — 2026-03-16

### Added
- Project scaffolding: backend (Express + TypeScript), frontend (React + Vite)
- Render deployment configuration
- Basic extraction skeleton for `videqs.download`

---

<!-- Versions -->
[Unreleased]: https://github.com/USERNAME/link-download/compare/v1.0.0-beta...HEAD
[1.0.0-beta]: https://github.com/USERNAME/link-download/compare/v0.1.0...v1.0.0-beta
[0.1.0]: https://github.com/USERNAME/link-download/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/USERNAME/link-download/releases/tag/v0.0.1
