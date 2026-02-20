---
name: update-docs
description: Scan the codebase and update docs/technical-overview.md to match the current state of the code. Use after making changes to architecture, API contracts, components, algorithms, or external services.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(ls *)
---

Scan the Roam codebase and update `docs/technical-overview.md` so it accurately reflects the current state of the code.

## Steps

1. **Read the current technical overview** at `docs/technical-overview.md` to understand what it currently documents.

2. **Scan the codebase** to discover what actually exists:
   - `app/` — pages, layouts, API routes
   - `lib/` — backend modules (types, LLM, routing, geocoding, GPX, geo math, etc.)
   - `components/` — React components
   - `package.json` — dependencies and scripts
   - `.env.example` — environment variables
   - Any other directories or files that are part of the application

3. **Compare** what the technical overview says vs what the code actually does. Look for:
   - **New files or modules** not documented
   - **Removed files or modules** still listed
   - **Changed API contracts** (request/response shapes, endpoints)
   - **New or changed components** not reflected in the components list
   - **New or changed external services** or environment variables
   - **Algorithm changes** in the loop generation or LLM integration
   - **State management changes**
   - **New dependencies** that affect the tech stack
   - **Directory structure changes**

4. **Update `docs/technical-overview.md`** with any discrepancies found. Preserve the document's existing structure and tone. Only change sections that are actually out of date — don't rewrite things that are still accurate.

5. **Update the "Last Updated" date** at the top of the document if any changes were made.

6. **Report** a summary of what was changed and why.

## Important

- Do NOT add speculative or planned features. Only document what exists in the code right now.
- Do NOT remove the "Known Limitations" section — update it if limitations have been addressed.
- Keep the same level of detail and writing style as the existing document.
- If nothing needs updating, say so — don't make changes for the sake of it.
