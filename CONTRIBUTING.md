# Contributing to ActionBox

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/nikos118/actionbox.git
cd actionbox
npm install
npm run build
npm test
```

## Making Changes

1. **Open an issue first** — for anything beyond a typo fix, open an issue to discuss the change before writing code. This saves everyone's time.

2. **Fork and branch** — fork the repo and create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature
   ```

3. **Write tests** — if you're adding or changing behavior, add tests. We use [Vitest](https://vitest.dev/).

4. **Run the checks** before submitting:
   ```bash
   npm run build      # TypeScript compiles cleanly
   npm test           # all tests pass
   npm run typecheck  # no type errors
   ```

5. **Submit a PR** — open a pull request against `main`. Describe what you changed and why.

## Code Style

- TypeScript, strict mode
- ESM modules (`.js` extensions in imports)
- No classes unless they manage stateful lifecycles (prefer functions)
- Tests live in `tests/` and mirror the `src/` structure

## What We're Looking For

- Bug fixes
- Test coverage improvements
- New violation types or matchers
- Better alert formatters
- Documentation improvements

## What Probably Needs an Issue First

- New CLI commands
- Changes to the ACTIONBOX.md schema
- New enforcement strategies
- Dependency additions

## License

By contributing, you agree that your contributions will be released under [The Unlicense](LICENSE).
