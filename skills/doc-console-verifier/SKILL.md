---
name: doc-console-verifier
description: Orchestrate the complete document verification workflow — from planning through collection, verification, and reporting. This is the top-level Skill that coordinates all other Skills in the system.
allowed-tools: Bash(playwright-cli:*), Bash(npx:*), Bash(cat:*), Bash(find:*), Bash(grep:*), Bash(jq:*), Read
---

# Doc Console Verifier (Orchestrator)

## Mission

Orchestrate the complete document verification workflow, coordinating all sub-Skills to produce a diff report and revision suggestions for a given document.

## Workflow

```
1. Read configuration → determine mode + fact-base path
2. [Optional] Source code extraction (Mode A)
3. Generate collection plan
4. Console collection/verification
5. Document verification
6. Output diff report
```

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

**Fact-base path convention**: `fact-base/{product}-{console}-{locale}/`
- Example: `fact-base/iga-byteplus-en/`, `fact-base/dcdn-volcengine-zh/`
- All output files go under this directory
- The `fact_base` field in config determines the root path

**Mode selection**:
- If `source_code_path` is not null and path exists → Mode A
- Otherwise → Mode B

## Step 2: Source Code Extraction (Mode A Only)

Invoke `ui-code-fact-extractor` logic:

1. Read source code from `source_code_path`
2. Detect tech stack
3. Extract facts by category (10 taxonomy categories)
4. Output to `{fact_base}/source-facts/{page-name}.json`
5. Also output human-readable version to `{fact_base}/source-facts/{page-name}.md`

**Dual-format output**: Every fact file must have both:
- `.json` — machine-readable, for programmatic comparison
- `.md` — human-readable, for review and collaboration

If extraction fails or produces low confidence results, fall back to Mode B for affected pages.

## Step 3: Generate Collection Plan

Invoke `doc-collection-planner` logic:

1. Parse the target document
2. Extract static claims and flow claims
3. Cross-reference with source facts (Mode A)
4. Assign confidence levels
5. Identify unknowns
6. Determine verification strategy
7. Output to `{fact_base}/collection-plan.json`

## Step 4: Console Collection/Verification

Invoke `console-fact-collector` logic:

### Mode A: Sampling Verification
1. Open browser with persistent session (use `--no-sandbox` in Trae IDE)
2. Load auth state from `{fact_base}/auth-state.json`
3. After `state-load`, always `goto` target URL to refresh page
4. Verify only items from collection plan where `verification_needed: true`
5. Record verification results to `{fact_base}/console-facts/verification-results.json`
6. Save meaningful screenshots to `{fact_base}/console-facts/screenshots/` with semantic names (e.g., `domain-list.png`, `scene-selector.png`)
7. Merge source facts + console facts → `{fact_base}/merged-facts/ui-merged-facts.json`

### Mode B: Full Collection
1. Open browser with persistent session (use `--no-sandbox` in Trae IDE)
2. Load auth state from `{fact_base}/auth-state.json`
3. After `state-load`, always `goto` target URL to refresh page
4. Collect all navigation, page structure, fields, options, flows
5. Output to `{fact_base}/console-facts/ui-console-facts.json`
6. Copy as `{fact_base}/merged-facts/ui-merged-facts.json`

### Process file cleanup
- `.yml` snapshots and `.log` files are process artifacts — do NOT keep them
- Only keep: verification JSON, semantically named screenshots, and merged facts
- Clean up process files after each collection session

## Step 5: Document Verification

Invoke `doc-fact-verifier` logic:

1. Read merged facts
2. Extract document claims
3. Match claims to facts
4. Classify discrepancies
5. Generate diff report → `{fact_base}/reports/{doc-name}-diff-report.md`
6. Generate revision suggestions

## Step 6: Human Review Points

The workflow pauses for human review at these points:

1. **After collection plan**: Review plan before executing console verification
2. **After diff report**: Review discrepancies before applying revisions

## Change-Driven Update Flow

When a human inputs a product change:

1. Read change description
2. Analyze impact on existing fact base:
   - Which pages are affected
   - Which fact categories need updating
   - Whether new test data is needed
3. Generate incremental collection plan (only affected pages)
4. Execute incremental console collection
5. Update merged facts
6. Re-verify affected documents
7. Update diff report

**Change input format** (saved to `{fact_base}/change-log.json`):
```json
{
  "change_id": "ch-001",
  "date": "2026-05-07",
  "description": "Description of what changed",
  "affected_areas": ["/page-path"],
  "recollection_status": "pending | in_progress | done"
}
```

## Error Handling

| Error | Action |
|-------|--------|
| Auth state expired | Inform user, pause for manual login, save new state after login |
| Auth state not taking effect | After `state-load`, always `goto` target URL to refresh page |
| Browser crashes in Trae IDE | Ensure `.playwright/cli.config.json` has `--no-sandbox --disable-gpu-sandbox` in launchOptions.args |
| Source code extraction fails | Fall back to Mode B |
| Console page not accessible | Skip page, note in report |
| Flow execution fails | Record failure, continue with next flow |
| Form validation blocks step advancement | Use test data strategy (reuse existing data with modifications), or rely on source code facts and mark as "source-code-only confidence" |
| Domain ownership verification required | Cannot complete automatically; use Strategy A (modify prefix of existing domain) or skip and note in report |
| Fact base missing | Start from Step 2 (extraction) |
| Dropdown data not loaded | Wait for API response, retry snapshot after delay |

## Output Files

All files are under `{fact_base}` (e.g., `fact-base/iga-byteplus-en/`):

| File | Path | Description |
|------|------|-------------|
| Meta | `{fact_base}/meta.json` | Product, console URL, locale, verified pages index |
| Auth state | `{fact_base}/auth-state.json` | Saved login state (⚠️ .gitignore) |
| Source facts | `{fact_base}/source-facts/{page}.json` + `.md` | Facts from source code (dual format) |
| Collection plan | `{fact_base}/collection-plan.json` | Verification plan |
| Console facts | `{fact_base}/console-facts/verification-results.json` | Source vs console comparison |
| Screenshots | `{fact_base}/console-facts/screenshots/{name}.png` | Semantically named screenshots |
| Merged facts | `{fact_base}/merged-facts/ui-merged-facts.json` | Combined fact base |
| Diff report | `{fact_base}/reports/{doc-name}-diff-report.md` | Final output |
| Change log | `{fact_base}/change-log.json` | Product change tracking |
