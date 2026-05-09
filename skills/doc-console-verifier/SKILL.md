---
name: doc-console-verifier
version: 0.2.0
description: Orchestrate the complete document verification workflow with an EXPLORATION-FIRST strategy — capture console facts independently of the document, then audit the document against those facts. The document is the suspect, never the script. This is the top-level Skill that coordinates all sub-Skills.
allowed-tools: Bash(npx:*), Bash(node:*), Bash(cat:*), Bash(find:*), Bash(grep:*), Bash(jq:*), Read
---

# Doc Console Verifier (Orchestrator)

## Mission

Audit a documentation file by **exploring the live console first** and only then comparing the document to that exploration's output. **The document is what we are auditing — never let it dictate what to verify or how to navigate.**

## Why exploration-first

Earlier versions of this orchestrator used the document to drive navigation. That pattern fails when the document is wrong: Playwright clicks a button by the wrong name, fails, and the workflow stalls — exactly when finding the bug matters most. Exploration-first inverts the dependency: facts come from the console (and source code if available), and the document is judged against those facts.

## Workflow (v2 — exploration-first)

```
1. Read configuration → determine mode + fact-base path
2. [Mode A only] Source code extraction → source-facts/
3. EXPLORATION → console-facts/ (via console-explorer)
   ├─ navigation-tree.json
   ├─ pages/{page}.json
   └─ exploration-report.json
4. [Mode A only] Cross-check source vs console → merged-facts/
5. Generate audit plan from facts (NOT from doc) → audit-plan.json
6. Document audit → reports/{doc}-diff-report.md
```

Key inversion vs v1: **Step 3 (exploration) precedes Step 5 (planning)**, and the planner reads facts, not the document, as its primary input.

## Step 1: Read Configuration

Read `config/project.json`:

```json
{
  "project": "project-name",
  "console_url": "https://console.example.com",
  "source_code_path": "/path/to/code | null",
  "docs_path": "/path/to/docs",
  "mode": "source-enhanced | console-only",
  "locale": "en",
  "locales": ["en"],
  "fact_base": "fact-base/{product}-{console}-{locale}"
}
```

Mode detection:
- `source_code_path` set and path exists → **Mode A** (source-enhanced)
- otherwise → **Mode B** (console-only)

## Step 2: Source Code Extraction (Mode A only)

Invoke `ui-code-fact-extractor`. Output: `{fact_base}/source-facts/{page}.json` + `.md`.

If extraction fails or produces low confidence, **do not abort** — continue to Step 3 with empty source facts. Exploration alone is sufficient for Mode B.

## Step 3: Exploration ⭐ (NEW)

Invoke `console-explorer` to produce the ground-truth fact base **without consulting the document**.

The exploration uses:
- The live console navigation tree (BFS).
- `source-facts/` as a *page hint* only (which routes likely exist) — NOT as a verification target.
- The document is not read at this stage.

Output:
- `{fact_base}/console-facts/navigation-tree.json`
- `{fact_base}/console-facts/pages/{page}.json`
- `{fact_base}/console-facts/ui-console-facts.json` (aggregated, conforms to `ui-code-facts/v1`)
- `{fact_base}/console-facts/exploration-report.json`

If exploration fails on a page, the page is recorded as `blocked` and the workflow continues. The blocked pages become a reportable finding ("X pages could not be explored — this is a documentation/automation gap").

## Step 4: Cross-check Source ↔ Console (Mode A only)

Invoke `console-explorer` Step 5 (or run as a separate pass): produce `{fact_base}/merged-facts/source-vs-console-diff.json` and `{fact_base}/merged-facts/ui-merged-facts.json`.

Evidence levels in merged facts:
- `confirmed` — present in both source and console
- `source-only` — likely outdated source or A/B-gated feature; **excluded** from the doc audit
- `explored` — present in console only; **included** in the doc audit
- `partial` — observed but enumeration incomplete

The doc audit (Step 6) judges the document against `confirmed ∪ explored` facts only.

## Step 5: Generate Audit Plan

Invoke `doc-collection-planner` v2.0+. The planner now:

1. Reads `{fact_base}/merged-facts/ui-merged-facts.json` (Mode A) or `{fact_base}/console-facts/ui-console-facts.json` (Mode B) — facts are the **input**.
2. Reads the target document.
3. For every fact, asks: *"does the document mention this?"* → produces `claims_audit[]`.
4. For every doc claim, asks: *"is this fact present?"* → produces `doc_claims[]` with `fact_support` field.
5. Identifies pages where exploration was `blocked` and recommends `additional_exploration_needed[]`.

Output: `{fact_base}/audit-plan.json` (validates against `schemas/audit-plan.v1.json`).

## Step 6: Document Audit & Diff Report

Invoke `doc-fact-verifier` to produce `{fact_base}/reports/{doc-name}-diff-report.md`.

The verifier classifies each finding:
- ✅ doc says X, fact confirms X
- ❌ doc says X, fact contradicts X (HIGH severity — likely doc bug)
- ❌ doc references element that doesn't exist (HIGH severity)
- 🆕 fact exists, doc doesn't mention it (MEDIUM severity — undocumented)
- ⚠️ exploration blocked, cannot determine (LOW severity — needs human)

## Human Review Points

Default workflow runs end-to-end without pausing. Pause **only** when one of these is true:

1. `--review-plan` flag passed → pause after Step 5.
2. Exploration produced `pages_blocked > 0` AND `--strict-exploration` is set.
3. Auth state expired during Step 3 (always pause for re-login).

Otherwise, run all 6 steps and surface the diff report.

## Change-Driven Update Flow

When a human inputs a product change:

1. Read change description.
2. Identify affected URLs.
3. Re-run Step 3 (exploration) **only** on affected URLs — `console-explorer` accepts `--pages` scope.
4. Re-run Step 4 (merge) and Step 5 (audit-plan) on affected pages.
5. Re-run Step 6 (audit) for documents that mention any affected URL.

Change record at `{fact_base}/change-log.json`:

```json
{
  "change_id": "ch-001",
  "date": "2026-05-07",
  "description": "...",
  "affected_urls": ["/iga/domains"],
  "recollection_status": "pending | in_progress | done"
}
```

## Error Handling

| Error | Action |
|-------|--------|
| Auth state expired | Pause, surface `auth_expired`, prompt user to re-login, then resume |
| Browser crash | Restart browser, resume from current page (idempotent) |
| Source code extraction fails | Continue with Mode B for that page, log warning |
| Exploration of one page fails | Mark page `blocked` in exploration-report, continue |
| **Doc-driven step fails** | NOT applicable in v2 — the workflow no longer drives navigation from doc |
| `ui-console-facts.json` schema invalid | Run `bin/doc-verify validate`; fix and re-explore the offending page |
| Test data blocks wizard advancement | Use Test Data Strategies A/B/C in `console-fact-collector`; mark step `partial` if all fail |

## Output Files

All under `{fact_base}` (e.g., `fact-base/iga-byteplus-en/`):

| File | Path | Notes |
|------|------|-------|
| Meta | `{fact_base}/meta.json` | Product/console/locale, verified pages index |
| Auth state | `{fact_base}/auth-state.json` | ⚠️ .gitignore'd |
| Source facts | `{fact_base}/source-facts/{page}.json` + `.md` | Mode A only |
| Navigation tree | `{fact_base}/console-facts/navigation-tree.json` | From exploration |
| Page facts | `{fact_base}/console-facts/pages/{page}.json` | From exploration |
| Console facts (agg) | `{fact_base}/console-facts/ui-console-facts.json` | Conforms to `ui-code-facts/v1` |
| Exploration report | `{fact_base}/console-facts/exploration-report.json` | Coverage + blocked pages |
| Source↔console diff | `{fact_base}/merged-facts/source-vs-console-diff.json` | Mode A only |
| Merged facts | `{fact_base}/merged-facts/ui-merged-facts.json` | Mode A only |
| Audit plan | `{fact_base}/audit-plan.json` | Doc-vs-facts crosswalk |
| Diff report | `{fact_base}/reports/{doc-name}-diff-report.md` | Final output |
| Change log | `{fact_base}/change-log.json` | Change tracking |

## Self-check before declaring done

The orchestrator is responsible for verifying:

- [ ] All schemas validate (`bin/doc-verify validate <file>` on every JSON output).
- [ ] `exploration-report.json` covers every leaf in `navigation-tree.json` (completed/partial/blocked).
- [ ] Diff report references evidence by file path + screenshot for every ❌ finding.
- [ ] No finding in the diff report is "the doc is correct because the doc says so" — every confirmation must point to a fact, not back to the doc.
