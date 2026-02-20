---
name: code-review
description: Run a comprehensive code review on all changes since main. Checks for bugs, conventions, architecture, design system alignment, security, performance, and more. Run before every push to GitHub.
allowed-tools: Read, Grep, Glob, Bash(npm run lint), Bash(npm run format:check), Bash(npm run build), Bash(npx tsc --noEmit *), Bash(npm test *), Bash(git diff *), Bash(git log *), Bash(git status *), Bash(ls *)
---

Run a thorough code review on all changes in the current branch compared to `main`. This is the pre-push quality gate.

## What to Review

Work through each section below **in order**. For each section, review every changed file. Report findings grouped by file, with a severity label:

- **🔴 BLOCKER** — Must fix before push. Bugs, security issues, broken builds, failing tests.
- **🟡 WARNING** — Should fix before push. Convention violations, missing error handling, performance concerns.
- **🟢 SUGGESTION** — Consider fixing. Improvements that aren't urgent but would make the code better.

If a section has zero findings, say so briefly and move on. Do not pad the review with praise or filler.

---

### 1. Scope the Changes

Determine what changed since `main`:

- Run `git diff main --stat` for an overview of changed files.
- Run `git diff main` for the full diff.
- Run `git log main..HEAD --oneline` for the commit history.
- Read each changed file in full (not just the diff) so you have full context.

Summarize the scope at the top of your review: what was added/changed/removed, and what the intent appears to be.

---

### 2. Correctness & Bugs

Look for actual bugs, logic errors, and incorrect behavior:

- Off-by-one errors, wrong comparisons, inverted conditions
- Null/undefined access without guards
- Promises that aren't awaited, or `async` functions called without `await`
- Race conditions in state updates (especially React `useState` with stale closures)
- Infinite loops or unbounded recursion
- Wrong variable used (copy-paste errors, shadowed names)
- Mutations of objects/arrays that should be treated as immutable (especially React state)
- API contract mismatches — does the frontend expect the same shape the backend returns?
- Edge cases: empty arrays, zero values, missing optional fields, very long strings

For each bug found, explain **what** is wrong, **why** it's a problem, and **how** to fix it.

---

### 3. Security

Check for vulnerabilities, especially the OWASP top 10 as they apply to a Next.js app:

- **Secrets exposure** — API keys, tokens, or credentials in client-side code or committed to git. Server-only env vars must NOT start with `NEXT_PUBLIC_`.
- **Injection** — unsanitized user input in SQL, shell commands, HTML (XSS), or URL construction.
- **Unsafe data handling** — `dangerouslySetInnerHTML`, `eval()`, `new Function()`, unvalidated redirects.
- **Missing input validation** — API routes that trust request bodies without validation.
- **CORS / CSRF** — improper headers or missing protections on API routes.
- **Dependency vulnerabilities** — new dependencies that are unmaintained, have known CVEs, or pull in excessive transitive deps.
- **Information leakage** — stack traces, internal paths, or verbose error details returned to the client.

---

### 4. Code Conventions & Style

Compare against the project's established conventions (from `CLAUDE.md`):

- **TypeScript strict mode** — no `any` types (use `unknown` + type guards), no `@ts-ignore` / `@ts-expect-error` without justification.
- **Formatting** — run `npm run format:check` and report any failures. Single quotes, semicolons, 2-space indent, 100 char line width, ES5 trailing commas.
- **Linting** — run `npm run lint` and report any failures.
- **Imports** — using the `@/*` path alias consistently. No relative imports that climb more than one level (`../../`).
- **Naming** — components are PascalCase, files match their default export, utility functions are camelCase.
- **File organization** — pure logic in `lib/`, React components in `components/`, API routes in `app/api/`. No framework-dependent code in `lib/`.
- **Tailwind** — using utility classes, not custom CSS (unless for CSS custom properties). Classes auto-sorted by prettier plugin.

---

### 5. Architecture & Patterns

Compare against the architecture documented in `docs/technical-overview.md`:

- **Separation of concerns** — is business logic in `lib/` and presentation in `components/`? API routes should be thin orchestrators, not contain business logic.
- **State management** — follows the discriminated union pattern? No unnecessary state libraries or complex state when simple `useState` suffices.
- **Data flow** — unidirectional? Props flowing down, events flowing up? No prop drilling more than 2 levels (extract a component or use composition).
- **API route structure** — follows the established request/response contract? Error responses follow the `{ status: "error", message: string }` pattern?
- **Module boundaries** — `lib/` modules have no React or Next.js imports. Components don't call external APIs directly (they go through the API route).
- **New patterns** — if a change introduces a new pattern (new state management approach, new way of calling APIs, etc.), flag it. New patterns need justification and should be consistent going forward.

---

### 6. Design System Alignment

Compare UI changes against `docs/design-system.md`:

- **Color tokens** — using CSS custom properties (`--color-*`), not hardcoded hex values. Correct token for the context (e.g., `--color-text-secondary` for labels, not `--color-text-primary`).
- **Typography** — following the type scale. Stat values use `stat-value` style (24px/800), labels use `subheading` (14px/700). `tabular-nums` on numeric displays.
- **Spacing** — using the 8px grid (`--space-*` tokens). No magic numbers for padding/margin.
- **Border radius** — using `--radius-*` tokens.
- **Shadows** — using `--shadow-*` tokens. Shadows only on elements that float above the map.
- **Layout** — map fills viewport, UI overlays/docks to edges. Z-index follows the documented scale.
- **Component behavior** — prompt input has `--radius-lg` and `--shadow-lg`, elevation profile uses documented chart colors, etc.
- **Motion** — transitions follow documented durations (120ms for color/opacity, 200ms for transforms, 250ms for layout). Respects `prefers-reduced-motion`.
- **Accessibility** — visible focus rings, color contrast meets WCAG AA, `aria-label` on the prompt input, `aria-live` on loading states.
- **Icons** — using Lucide icons, 20px size, 1.5px stroke. Icons paired with text labels (no icon-only buttons except map controls).

---

### 7. Reuse & Duplication

Check that the codebase isn't accumulating unnecessary variations:

- **Duplicated logic** — same calculation, fetch pattern, or transformation appearing in multiple places. Should be extracted to a shared utility in `lib/`.
- **Duplicated components** — similar UI patterns that should be the same component with props.
- **Duplicated types** — same shape defined in multiple files instead of imported from `lib/types.ts`.
- **Reinventing existing utilities** — using manual implementations when a project dependency already provides the function (e.g., hand-rolling distance calculation when `lib/geo.ts` has it).
- **Inconsistent patterns** — two different ways of doing the same thing (e.g., some API calls use `fetch` directly, others use a wrapper).

---

### 8. Error Handling & Edge Cases

- **API routes** — do they catch errors and return structured error responses? Are external service failures (Claude, GraphHopper, Nominatim) handled gracefully?
- **Frontend** — does the UI handle all states in the discriminated union (`idle`, `loading`, `success`, `error`)? Are loading and error states shown appropriately?
- **Network failures** — what happens if `fetch` throws? Is there a try/catch?
- **Timeouts** — are external API calls bounded by timeouts?
- **Validation** — are inputs validated at system boundaries (API route request body, external API responses)?
- **Graceful degradation** — if a non-critical feature fails (e.g., geolocation), does the app still work?

---

### 9. Performance

- **React rendering** — unnecessary re-renders from unstable references (objects/arrays created in render, missing `useMemo`/`useCallback` where it matters). Note: don't over-optimize — only flag when it causes real issues (e.g., re-creating a MapLibre instance on every render).
- **Bundle size** — large imports that should be tree-shaken or lazy-loaded. Importing an entire library when only one function is needed.
- **API efficiency** — unnecessary sequential calls that could be parallel (`Promise.all`). Redundant API calls.
- **Memory leaks** — event listeners or subscriptions not cleaned up in `useEffect` return.
- **Image / asset optimization** — using `next/image` for images, not raw `<img>` tags.

---

### 10. Tests

- If a test framework is configured: run `npm test` and report any failures.
- If tests exist for changed code: are they updated to reflect the changes?
- If new logic was added without tests: flag it as a **WARNING** (not a blocker for v0, but note it).
- If tests are brittle (testing implementation details instead of behavior): flag as **SUGGESTION**.

---

### 11. Build Verification

- Run `npm run build` and report any errors. TypeScript compilation errors, missing imports, and other build failures are **BLOCKERs**.

---

## Output Format

Structure the review as:

```
## Review Summary

**Scope:** [1-2 sentence summary of what changed]
**Verdict:** [PASS | PASS WITH WARNINGS | BLOCKED]
**Blockers:** [count] | **Warnings:** [count] | **Suggestions:** [count]

## Findings

### [filename.ts]

- 🔴 **BLOCKER:** [description]
  - **Line(s):** [line numbers]
  - **Why:** [explanation]
  - **Fix:** [how to fix]

- 🟡 **WARNING:** [description]
  ...

### [another-file.ts]
...

## Automated Checks

- **Lint:** ✅ Pass | ❌ [count] issues
- **Format:** ✅ Pass | ❌ [count] issues
- **Build:** ✅ Pass | ❌ [error summary]
- **Tests:** ✅ Pass | ❌ [failure summary] | ⚠️ No test framework configured

## Recommendation

[If BLOCKED: list the blockers that must be fixed before push]
[If PASS WITH WARNINGS: summarize what should ideally be addressed]
[If PASS: confirm it's good to push]
```

## Important

- Read every changed file **in full**, not just the diff hunks. Bugs often come from interactions with surrounding code.
- Do NOT nitpick formatting if `npm run format:check` passes — the formatter is the authority.
- Do NOT suggest adding comments, docstrings, or type annotations to unchanged code.
- Do NOT suggest refactors that are unrelated to the changes being reviewed.
- Be concrete and specific. "This could be improved" is useless. Say exactly what's wrong and how to fix it.
- If the changes are clean, say so. A short "PASS" review is better than a padded one.
