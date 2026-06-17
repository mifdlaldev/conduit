# Contributing to Universal Downloader

Thank you for considering contributing! This project aims to be a high-quality, production-grade video extraction tool.

## Code of Conduct

By participating, you agree to uphold our [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful, constructive, and professional.

## Development Setup

```bash
git clone https://github.com/mifdlaldev/conduit.git
cd conduit

# Backend
cd backend
npm install
npm run playwright:install

# Frontend  
cd ../frontend
npm install
```

### Running Locally

```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

Or with Docker:

```bash
docker compose up
```

## Project Standards

### Code Quality

- **TypeScript strict mode** — no `any`, no `@ts-ignore`, no `@ts-expect-error`
- **Error handling** — all catches use `error: unknown` + `instanceof` pattern
- **Logging** — use the Pino logger (`import { logger } from "../logger"`), never `console.log`
- **Error classes** — extend `ExtractError` for typed HTTP status codes
- **No empty catches** — always log or document why a catch is intentionally empty

### Testing

- Run `npm test` before opening any PR
- All new code should include tests
- Coverage threshold: 80% lines minimum
- Use Vitest with descriptive test names (`it("returns X when Y", ...)`)

### Commit Messages

We use conventional commits:

```
<type>(<scope>): <description>

feat:     New feature
fix:      Bug fix
refactor: Code change without feature/fix
test:     Adding/updating tests
docs:     Documentation
chore:    Build, CI, tooling
```

### Branch Strategy

- `main` — production-ready, protected with CI checks
- Feature branches: `feat/<feature-name>`
- Bug fixes: `fix/<issue-description>`
- Always open a PR to `main`

## Pull Request Process

1. Create a branch from `main`
2. Implement your changes with tests
3. Run `npm test` and `npm run build` — both must pass
4. Open a PR with a clear description
5. Reference any related issues
6. Wait for CI to pass
7. Request review

## Adding a New Provider

1. Add the domain to `helpers.ts` > `allowedHostSuffixes`
2. If direct resolution is possible (like Videy), create a provider file in `extractor/providers/`
3. The browser-based extractor in `browser.ts` works generically — no changes needed for most providers
4. Add the provider to `detectProvider()` in `helpers.ts`
5. Add test URLs to the relevant tests
6. Update the README API documentation

## Security

If you find a security vulnerability, **do not** open a public issue. Follow our [security policy](SECURITY.md).

## Questions?

Open a [discussion](https://github.com/mifdlaldev/conduit/discussions) or check existing issues.
