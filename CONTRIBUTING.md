# Contributing

Thank you for contributing to `dexie-reactive`.

This project focuses on predictable, shared Dexie `liveQuery` state for Vue and Nuxt applications with a stable and minimal public API.

---

## Development Setup

Clone the repository and install dependencies:

```sh
npm install
```

Run the full project quality checks:

```sh
npm run check
```

---

## Available Scripts

### Quality

```sh
npm run lint
npm run format:check
npm run typecheck
```

### Testing

```sh
npm run test
npm run test:browser
npm run test:coverage
```

### Build

```sh
npm run build
```

### Full Validation

```sh
npm run check
```

---

## Contribution Expectations

### Keep The Public API Stable

The public API is intentionally small and should remain predictable.

Avoid:

- unnecessary abstractions
- implicit behavior
- breaking public API changes
- framework lock-in outside Vue/Nuxt compatibility goals

---

### Prefer Simplicity

Prefer:

- readable code
- explicit ownership
- predictable reactive behavior
- small focused composables

Avoid:

- over-engineering
- unnecessary dependencies
- hidden side effects

---

### Tests Are Required

All new functionality must include tests.

Bug fixes should include regression coverage where possible.

The repository contains:

- unit tests
- browser integration tests
- coverage validation

---

### Browser Behavior Matters

`dexie-reactive` depends on real browser IndexedDB behavior.

Changes affecting:

- lifecycle handling
- subscriptions
- cleanup
- concurrency
- shared state
- Dexie interaction

should be validated with browser integration tests when applicable.

---

## Pull Requests

### Branch Naming

Use:

```txt
<type>/<issue_number>-<description>
```

Examples:

```txt
feat/12-add-query-reset-support
fix/18-handle-stale-results
docs/22-update-readme
ci/30-improve-release-workflow
```

---

### Commit Messages

This repository uses Conventional Commits.

Examples:

```txt
feat: add restart lifecycle support
fix: prevent stale live query updates
docs: update quick start examples
ci: optimize changelog workflows
```

---

### Pull Request Expectations

Pull requests should:

- reference the related issue
- explain the reason for the change
- include tests when applicable
- keep scope focused
- update documentation if behavior changes

PR descriptions should include:

```md
## Summary

## Changes

## Testing
```

---

## Documentation Expectations

Update documentation when changing:

- public API behavior
- composable contracts
- setup instructions
- workflow behavior
- testing expectations

This includes:

- `README.md`
- examples
- workflow documentation
- contributor documentation

---

## Release And Versioning

The repository uses:

- semantic versioning
- automated changelog generation
- automated npm publishing
- GitHub Actions based release workflows

Breaking public API changes must be treated as major releases.

---

## Questions And Discussions

If behavior or architecture is unclear:

- open an issue
- ask questions before implementing large changes
- avoid assumptions around public API semantics

Especially for:

- shared state ownership
- lifecycle behavior
- SSR semantics
- query reset behavior
- Dexie integration patterns
