# Changelog

All notable changes to `@papercargo/jin-cli` will be documented in this file.

## [0.1.2] — 2026-05-24

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
