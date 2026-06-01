# Changelog

All notable changes to `@papercargo/jin-cli` will be documented in this file.

## [0.2.3] — 2026-05-31

### Changed
- Implemented decentralized IdP pattern for Jin Shield in TypeScript and Python crypto engines
- Updated README version references to 0.2.3

## [0.2.2] — 2026-05-30

### Added
- **Jin Shield Universal Security Perimeter** — cryptographic gateway boundary protecting endpoints against rogue scrapers
- RS256 JWT agent passport verification engines for TypeScript (`jin_core.ts`) and Python (`jin_core.py`)
- 12 framework-specific middleware/adapter templates:
  - **JavaScript/TypeScript**: Express, Next.js (App & Pages Routers), Hono, Fastify, NestJS Guards, tRPC
  - **Python**: FastAPI ASGI, Flask hooks, Django middleware (sync + async)
  - **Enterprise**: Laravel PHP middleware, Ruby on Rails controller concern
- In-memory JWKS caching with automatic key rotation handling
- Zero-hop, strictly local RS256 signature verification (no external DB calls)
- In-memory request metrics tracking (`activeRequests`, `totalRequests`)

## [0.2.1] — 2026-05-29

### Changed
- Enhanced README with architecture diagram, E2E test logs, and Sovereign Agentic Economy section
- Version bump for README-only release

## [0.2.0] — 2026-05-28

### Added
- **10 new framework scanners** for `jin init`:
  - FastAPI (Python) — typed parameter normalization and catch-all support
  - Django REST Framework (Python) — URL paths, `re_path` regexes, ViewSet routers
  - Flask (Python) — methods lists and verb shortcuts
  - Laravel (PHP) — direct web/api PHP routes and optional arguments
  - Ruby on Rails — direct endpoints and `resources` macros
  - Fastify (Node) — verb extraction and `.route()` object configuration
  - Hono (Edge/TS) — inline parameter constraint filter removal
  - NestJS (Enterprise) — class prefix + method decorator matching
  - tRPC (TS-Native) — recursive nested router traversal with dot-notation
  - OpenAPI/Swagger — **recursive workspace spec discoverer**
- Stateful lexical router traversal for multi-level nested routers
- Advanced parameter normalization (typed path variables, catch-alls, regex filters, optional params)
- Express middleware template (`src/middleware/express.ts`)
- FastAPI middleware template (`src/middleware/fastapi.py`)



### Changed
- Moved package to dedicated repository at [github.com/meetjin/jin](https://github.com/meetjin/jin)
- Fixed deprecated `@meetjin/cli` references → `@papercargo/jin-cli`
- Dynamic User-Agent version header (reads from `package.json`)
- Added TypeScript declaration files to published package
- Added explicit `files` field to `package.json`

### Removed
- Deprecated `@meetjin/core`, `@meetjin/sdk`, `@meetjin/tools` stubs

## [0.1.1] — 2026-05-20

### Added
- `jin watch` command — live file watching with auto-revalidation
- Dart/Flutter scanner
- Supabase Edge Functions scanner

## [0.1.0] — 2026-05-17

### Added
- Initial release
- `jin init` — scan codebase and generate `jin.json` scaffold
- `jin validate` — validate against AIP v0.1 spec
- `jin serve` — local dev server at `/.well-known/jin.json`
- `jin publish` — publish to meetjin.com registry
- Framework scanners: Next.js, React Router, Express, Vite+React, OpenAPI
