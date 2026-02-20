---
name: update-docs
description: Scan the codebase and update all project documentation to match the current state of the code. Use after making changes to architecture, API contracts, components, algorithms, or external services.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(git diff *), Bash(git log *), Bash(ls *)
---

Scan the Roam codebase and update **all project documentation** so it accurately reflects the current state of the code. This goes beyond a single file — reason over the changes and decisions made during the work and propagate updates across every relevant doc.

## Documentation Targets

These are the files this skill may update. Not every run will touch every file — only update what's actually out of date.

| File                         | Purpose                                                               | Update when…                                                                          |
| ---------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `docs/technical-overview.md` | Architecture, algorithms, API contracts, data flow, external services | Modules, endpoints, services, or algorithms changed                                   |
| `docs/design-system.md`      | UI tokens, layout rules, component guidelines                         | New components, tokens, layout patterns, or design conventions changed                |
| `docs/test-framework.md`     | Testing philosophy, conventions, patterns                             | Test tooling, conventions, or coverage expectations changed                           |
| `CLAUDE.md`                  | Project summary, commands, directories, env vars, code style          | New commands, directories, env vars, dependencies, or conventions added/removed       |
| `.claude/skills/*/SKILL.md`  | Skill definitions for Claude Code                                     | A skill's scope, allowed tools, or instructions need adjustment based on code changes |

**Do NOT touch** `docs/AI_Cycling_Route_App_Project_Overview.md` or anything in `project-overview/` — those are static planning artifacts.

## Steps

### 1. Understand What Changed

Before updating anything, build a clear picture of the recent work:

- Run `git diff main --stat` and `git diff main` to see what files changed and how.
- Run `git log main..HEAD --oneline` for commit history.
- If on `main` with no branch diff, look at unstaged/staged changes and recent commits instead.
- Read each changed file to understand **what was built, refactored, or removed** and **why**.

Produce a mental summary: what was the intent of the changes? What decisions were made? What patterns were introduced or changed?

### 2. Read All Documentation Targets

Read every documentation file listed above so you know their current state before making edits.

### 3. Compare and Identify Gaps

For each documentation target, check whether the changes from Step 1 create any discrepancies:

**`docs/technical-overview.md`:**

- New or removed files/modules not reflected
- Changed API contracts (request/response shapes, endpoints)
- New or changed external services or environment variables
- Algorithm changes (route generation, LLM integration, geo math)
- State management or data flow changes
- New dependencies that affect the tech stack

**`docs/design-system.md`:**

- New UI components or component behavior changes
- New or changed design tokens (colors, spacing, typography, shadows, etc.)
- Layout pattern changes
- New motion/animation conventions
- Accessibility updates

**`docs/test-framework.md`:**

- New test utilities or helpers introduced
- Changed testing conventions or patterns
- New test categories or coverage expectations
- Tooling changes (vitest config, test scripts)

**`CLAUDE.md`:**

- New npm scripts or changed commands
- New directories or changed directory purposes
- New external services or env vars
- Changed code style conventions
- New or changed documentation files that should be referenced

**`.claude/skills/*/SKILL.md`:**

- Does a skill reference files, patterns, or conventions that changed?
- Does a skill's allowed-tools list need updating?
- Does a skill's description need adjusting to match new scope?

### 4. Apply Updates

For each file with discrepancies:

- Preserve the document's existing structure, tone, and level of detail.
- Only change sections that are actually out of date — don't rewrite accurate content.
- Update any "Last Updated" dates if present.
- Keep cross-references between documents consistent (e.g., if CLAUDE.md references a doc section, make sure it still exists).

### 5. Verify Consistency

After edits, do a quick cross-check:

- Do all cross-references between docs still resolve? (e.g., CLAUDE.md links to docs that exist with correct descriptions)
- Are env vars, commands, and directory listings consistent across CLAUDE.md and technical-overview.md?
- Do skill files reference correct file paths and conventions?

### 6. Report

Summarize what was updated and why, grouped by file. If a file was reviewed and nothing needed changing, say so briefly.

## Important

- Do NOT add speculative or planned features. Only document what exists in the code right now.
- Do NOT remove "Known Limitations" or similar sections — update them if limitations have been addressed.
- Do NOT make changes for the sake of it. If nothing needs updating, say so.
- Keep the same writing style as each document's existing content.
- Think about **decisions and patterns**, not just file changes. If the work introduced a new convention (e.g., a new error handling pattern, a new component structure), make sure it's documented where future development would need to know about it.
