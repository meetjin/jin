# Contributing to Jin

Thanks for your interest in contributing to Jin and the Agent Intent Protocol (AIP) (v0.2.5+).

## Ways to contribute

### 1. Publish your app

The simplest and most impactful contribution — make your app agent-ready:

```bash
npx @papercargo/jin-cli init
npx @papercargo/jin-cli validate
npx @papercargo/jin-cli publish
```

Every listing makes the standard more valuable for agents and developers.

### 2. Contribute community intent maps

Write intent maps for apps that haven't adopted AIP natively. Browse examples at [meetjin.com/explore](https://meetjin.com/explore) and submit via PR.

Community intent maps help agents interact with popular apps even before the app officially supports AIP.

### 3. Improve the CLI

Found a bug? Have an idea for a new scanner or feature?

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run validation: `npm run build`
5. Commit with a descriptive message: `git commit -m "feat: add X scanner"`
6. Push and open a PR

### 4. Improve the spec

The AIP specification evolves through community discussion. To propose a change:

1. Open an [issue](https://github.com/meetjin/jin/issues) describing the problem
2. Include your proposed change and rationale
3. The community discusses and iterates

## Development setup

```bash
git clone https://github.com/meetjin/jin.git
cd jin
npm install
npm run build
```

Test the CLI locally:

```bash
node dist/index.js --help
node dist/index.js init
node dist/index.js validate
```

## Code style

- TypeScript strict mode
- Descriptive variable names
- Keep dependencies minimal

## Submitting a Pull Request

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Test locally: `npx @papercargo/jin-cli init` in a sample project
5. Push and open a PR against `main`
6. Wait for review — all PRs require approval before merging

## Branch Naming
- `feature/` — new scanners, features
- `fix/` — bug fixes
- `docs/` — documentation only
- `chore/` — maintenance, dependencies

## License

By contributing, you agree that your contributions will be licensed under:
- **Apache 2.0** for CLI tooling
- **CC0 1.0** for specification content

See [LICENSE](LICENSE) and [LICENSE-SPEC](LICENSE-SPEC) for details.
