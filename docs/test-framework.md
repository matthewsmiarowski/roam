# Test Framework

## Philosophy

Tests exist to catch real breakage, not to prove coverage metrics. Every test in this codebase should protect against a bug that would actually affect a user — a wrong distance calculation, malformed GPX, a broken API contract. If a test breaks because an implementation detail changed but behavior didn't, delete the test.

### What we test

1. **Pure logic in `lib/`** — geo math, GPX generation, distance validation, loop geometry. These are deterministic, have clear inputs/outputs, and are the core of what makes routes correct. This is where most tests live.

2. **Orchestration logic** — the conversation orchestrator (`lib/conversation.ts`), state reducer (`lib/conversation-state.ts`), and LLM integration (`lib/llm.ts`). External services are mocked at the boundary. We test that the logic handles happy paths and error cases correctly.

3. **Critical edge cases** — antimeridian wrapping, zero-distance routes, missing fields, malformed LLM responses. Things that would silently produce wrong results.

### What we don't test

- **React components** — the UI is thin glue between state and libraries (MapLibre, Recharts). Testing that a component renders a `<div>` with the right class is busywork. Visual correctness is verified by looking at the app.

- **External API behavior** — we don't test that GraphHopper returns valid routes or that Claude parses prompts. Those are their problem. We test how _our code_ handles their responses.

- **Type correctness** — TypeScript strict mode handles this. Don't write tests that just verify types.

- **Trivial wiring** — if a function just passes arguments to another function, it doesn't need a test.

---

## Setup

**Runner:** [Vitest](https://vitest.dev/) — fast, TypeScript-native, same API as Jest but with ESM support and no config gymnastics.

**Structure:**

```
lib/
├── geo.ts
├── geo.test.ts              # test file lives next to source
├── gpx.ts
├── gpx.test.ts
├── routing.ts
├── routing.test.ts
├── conversation.ts
├── conversation.test.ts
├── conversation-state.ts
├── conversation-state.test.ts
├── llm.ts
├── llm.test.ts
└── ...
```

Test files are **co-located** with their source files using the `.test.ts` suffix. No separate `__tests__` directories, no `tests/` folder at the root. When you open a source file, its tests are right there.

---

## Conventions

### Naming

Test files: `{module}.test.ts`

Describe blocks: use the function or module name.

Test names: describe the **behavior**, not the implementation. Start with a verb.

```typescript
describe('haversine', () => {
  it('returns 0 for identical points', () => { ... });
  it('calculates distance between known cities within 1% accuracy', () => { ... });
});
```

Bad: `it('should call Math.sin with the correct arguments')`
Good: `it('calculates distance between known cities within 1% accuracy')`

### Assertions

Use Vitest's built-in `expect`. For floating point comparisons (common in geo math), use `toBeCloseTo`:

```typescript
expect(haversine(pointA, pointB)).toBeCloseTo(expectedKm, 1); // 1 decimal place
```

### Mocking external services

Two patterns, depending on what you're testing:

**Testing an orchestrator** (like the API route) that calls `lib/` modules — mock the modules:

```typescript
// Good: mock owned modules when testing the orchestrator that calls them
vi.mock('@/lib/geocoding', () => ({
  geocode: vi.fn().mockResolvedValue({ lat: 41.9794, lng: 2.8214 }),
}));
```

**Testing a `lib/` module** that makes HTTP calls directly — mock `fetch`:

```typescript
// Good: mock fetch when testing the module that IS the HTTP boundary
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
```

Don't mock `fetch` when testing code that doesn't call `fetch` directly — mock the module that wraps it instead.

Keep mock data minimal. Don't paste 200-line API responses — build small fixtures with only the fields your code actually reads.

### Fixtures

If mock data is reused across multiple test files, put it in a `fixtures/` directory next to the tests that use it:

```
lib/
├── fixtures/
│   └── graphhopper-response.ts   # only if shared across multiple test files
├── routing.ts
└── routing.test.ts
```

If a fixture is only used in one test file, define it inline in that file.

---

## Commands

| Task                    | Command                          |
| ----------------------- | -------------------------------- |
| Run all tests           | `npm test`                       |
| Run tests in watch mode | `npm run test:watch`             |
| Run a specific file     | `npx vitest run lib/geo.test.ts` |
| Run with coverage       | `npx vitest run --coverage`      |

---

## When to write tests

- **New `lib/` module** — write tests for the core logic before or alongside the implementation. These modules are pure functions with clear contracts; tests are cheap and high-value.

- **Bug fix** — if a bug was caused by incorrect logic (not a typo), add a test that would have caught it.

- **State or orchestration change** — if the conversation state machine or route generation orchestration changes, update the corresponding tests.

- **Don't** write tests preemptively for code that doesn't exist yet or might change shape. Write them when the interface stabilizes.

## When to delete tests

- The test breaks because of an implementation refactor but behavior is unchanged — delete or rewrite it.
- The feature the test covers was removed — delete the test.
- The test is flaky — fix the root cause or delete it. Flaky tests are worse than no tests.

---

## Ground rules

1. **No snapshot tests.** They break constantly and nobody reads the diff.
2. **No mocking internals.** Don't mock private functions or internal details of a module to test that same module. Mocking _other_ modules you own is fine when testing an orchestrator (e.g., mock `lib/geocoding` when testing the API route).
3. **No test-only code in production modules.** Don't add `if (process.env.NODE_ENV === 'test')` branches or export internals just for testing.
4. **Tests must be fast.** The full suite should run in under 5 seconds. If a test needs a real network call, it doesn't belong in the unit test suite.
5. **Fewer, better tests.** 10 well-chosen tests that cover real behavior are worth more than 100 tests that assert implementation details.
