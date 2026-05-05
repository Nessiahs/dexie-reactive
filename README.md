# dexie-reactive

Reactive Dexie live queries for Vue.

## Scripts

- `npm run lint` checks the code with ESLint.
- `npm run format:check` verifies Prettier formatting.
- `npm run typecheck` runs TypeScript without emitting files.
- `npm run test` runs Vitest tests from `tests/*`.
- `npm run test:browser` runs Playwright browser integration tests.
- `npm run build` builds the package with unbuild.
- `npm run check` runs linting, formatting, type checking, tests, and build.

## Testing Strategy

The unit test suite focuses on the shared live query contract:

- public API exports and returned reactive state shape
- browser singleton and SSR-isolated subscription scopes
- producer lifecycle for start, stop, restart, unsubscribe, and cleanup
- duplicate producer rejection without creating a second Dexie subscription
- consumer coordination for producer-first and waiting-consumer flows
- shared reactive state references instead of cloned consumer state
- stale result protection across stop, restart, scope disposal, and rapid query changes
- missing, invalid, and changing query function handling
- error, loading, and development-only error exposure behavior
- generated UUID key uniqueness
- Dexie `liveQuery` usage through the provided query callback

The browser integration suite mounts a minimal Vue app in Chromium with a real
Dexie IndexedDB database. It verifies producer and consumer components sharing
one key, database updates propagating to all mounted components, consumer
unmount/remount behavior, and duplicate producer errors in the browser runtime.

## Git Hooks

Husky runs staged linting before commits and commitlint for commit messages.
