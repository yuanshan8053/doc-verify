---
name: console-explorer
version: 0.1.0
description: Explore a product console autonomously and capture full UI facts (navigation, sections, fields, options, flows) WITHOUT relying on a documentation. Use this skill BEFORE matching against any document — facts come first, document is the suspect. This is the answer to "the doc is wrong, Playwright gets stuck": exploration produces the ground truth that the doc is then judged against.
allowed-tools: Bash(npx:*), Bash(jq:*), Bash(cat:*), Bash(find:*), Bash(grep:*), Read
---

# Console Explorer

## Mission

**Treat the document as a hypothesis, not a script.** Explore the live console as if no documentation existed, and capture a structured fact snapshot that is later compared to the document. The exploration must succeed even when the document is wrong, missing, or outdated.

This skill is the **fact source of truth** for Mode B, and the **fact verifier** for Mode A.

## When to use

- Before any `doc-fact-verifier` run — exploration produces the fact base that verification compares against.
- When `console-fact-collector` reports `flow_blocked` because doc-driven steps failed (fall back here).
- When `source_code_path` is null (Mode B) — this skill is the only fact source.
- When the user reports "the doc is wrong" — re-run this skill on affected pages.

## Core Principle: Document-Independent Exploration

Do **NOT** read the document until exploration is complete. The exploration plan is built from:

1. **Navigation tree** discovered live from the console sidebar.
2. **`source-facts/`** if present (Mode A) — used as a hint for which pages exist, not as a script.
3. **NEVER** the document. The document is what we are auditing.

If you find yourself thinking "the doc says click X, let me find X", **stop**. Go back to exploring all clickable elements on the current page and record what is actually there.

## Step 0: Read Configuration

Read `config/project.json`:
- `console_url`: Entry point for exploration.
- `fact_base`: Where to write `console-facts/`.
- `source_code_path`: If set, read `{fact_base}/source-facts/*.json` for **page hints only** (which routes exist). Do NOT use it as a verification target — that is `doc-fact-verifier`'s job.

## Step 1: Session Setup

Reuse `console-fact-collector`'s Step 1 verbatim — open browser via `bin/doc-verify console`, then verify login state structurally:

```bash
npx @playwright/cli@latest eval "JSON.stringify({url: location.href, hasPwd: !!document.querySelector('input[type=password]'), title: document.title})"
```

If `url` matches `/login|/sso|/signin/i` or `hasPwd === true` → auth expired, stop and surface `auth_expired`.

## Step 2: Navigation Discovery (BFS)

Build the navigation tree **from the live console**, not from any config:

```bash
npx @playwright/cli@latest goto {console_url}
npx @playwright/cli@latest snapshot --raw > /tmp/nav-snapshot.txt
```

Parse the ARIA tree and extract every element with `role="link"|"menuitem"|"treeitem"` whose href / data-path leads inside the console. Build a tree:

```json
{
  "id": "nav-domains",
  "label": "Domains",
  "url": "/iga/domains",
  "depth": 1,
  "children": [...]
}
```

For collapsed menus, **expand them**: click the parent, snapshot again, capture children. Iterate until the tree is stable (no new nodes after one full pass).

Save to `{fact_base}/console-facts/navigation-tree.json`.

## Step 3: Page-by-Page Exploration

For each leaf URL in the navigation tree, run a **Page Exploration Pass**:

### 3.1 Land on the page

```bash
npx @playwright/cli@latest goto {page_url}
# Wait for readyState=complete and any in-flight XHR to settle:
npx @playwright/cli@latest eval "new Promise(r => { if (document.readyState==='complete') r(true); else window.addEventListener('load', () => r(true)); })"
```

### 3.2 Capture the structural snapshot

```bash
npx @playwright/cli@latest snapshot --raw > /tmp/page-snapshot.txt
```

Extract from the ARIA tree:

| Fact | ARIA roles to inspect |
|------|------------------------|
| Page title | `role="heading"` near top + `<title>` |
| Tabs / Sections | `role="tab"` / `role="tablist"` / `role="region"` / heading hierarchy |
| Form fields | `role="textbox"` / `role="combobox"` / `role="checkbox"` / `role="switch"` / `role="radio"` / `role="spinbutton"` |
| Buttons / Actions | `role="button"` / `role="link"` |
| Help text | `aria-describedby` targets, `role="tooltip"` |
| Limits / Counters | text matching `/\d+\s*\/\s*\d+/` near inputs |

### 3.3 Expand every collapsed surface

Things that hide facts when collapsed — **must be expanded**:

- **Dropdowns / Selects**: click each `role="combobox"`, snapshot to capture `role="option"` children, then press `Escape`.
- **Tabs**: click each `role="tab"`, snapshot per tab.
- **Accordions / Collapsibles**: click each `aria-expanded="false"` element.
- **Tooltips / Popovers**: hover or focus elements with `aria-describedby`.
- **Conditional fields**: toggle each switch/radio and re-snapshot — fields may appear/disappear.

For each expand action, record:

```json
{
  "trigger": { "ref": "...", "label": "..." },
  "revealed": ["option-A", "option-B", "option-C"],
  "screenshot": "{fact_base}/console-facts/screenshots/{page}-{trigger}.png"
}
```

### 3.4 Wizard / multi-step flow exploration

If the page has `role="button"` labeled `Add` / `Create` / `New`, open the wizard and explore **all reachable steps without submitting**:

1. Click open the wizard.
2. At each step, snapshot to capture step header (`role="navigation"` with step indicator), all fields, and the next-step button label.
3. Try to advance using the **Test Data Strategy** (see `console-fact-collector` §Test Data Strategy). If validation blocks advancement:
   - Record the validation error verbatim.
   - Mark this step as `advance_blocked` with the blocking field id and message.
   - **Continue** by trying alternative strategies (Strategy A: reuse existing; Strategy C: minimal input). Do NOT give up after the first failure.
4. If still blocked after 2 strategy attempts, record the step as `partial` and **back out** of the wizard with `Cancel` / `Esc`. Do not abandon the entire page.
5. Persist the wizard fact: ordered step labels, fields per step, blocking conditions.

### 3.5 Output per page

Save `{fact_base}/console-facts/pages/{page-id}.json` conforming to `schemas/ui-code-facts.v1.json` (same schema as source-facts), plus an `evidence` field on every fact:

```json
{
  "id": "field-rule-type",
  "label": "Rule type",
  "type": "select",
  "options": [...],
  "evidence": "explored",
  "evidence_screenshot": "screenshots/caching-rule-type.png",
  "explored_at": "2026-05-08T13:22:00Z"
}
```

`evidence` values:
- `explored` — directly observed in this run (highest trust).
- `inferred` — derived from another explored fact (e.g., field is required because submit failed without it).
- `partial` — observed but blocked from full enumeration (e.g., wizard step 3 not reached).

## Step 4: Aggregate

After all pages are explored:

```
{fact_base}/console-facts/
  navigation-tree.json      # Step 2 output
  pages/
    {page-id}.json          # Step 3 output, one per page
  ui-console-facts.json     # Aggregated, conforming to ui-code-facts/v1
  exploration-report.json   # See below
```

`exploration-report.json`:

```json
{
  "explored_at": "2026-05-08T13:22:00Z",
  "pages_total": 24,
  "pages_completed": 22,
  "pages_partial": 2,
  "pages_blocked": 0,
  "blocked": [
    {
      "page": "/iga/domains/add",
      "blocked_at_step": 3,
      "reason": "Domain ownership TXT record verification required",
      "strategies_tried": ["minimal-input", "reuse-existing"],
      "fallback": "step-3-and-beyond marked source-code-only"
    }
  ]
}
```

## Step 5: Mode A — Cross-check with source-facts

If `{fact_base}/source-facts/*.json` exists, generate a side-by-side comparison and write to `{fact_base}/merged-facts/source-vs-console-diff.json`:

- Facts present in both → `evidence: "confirmed"`.
- Facts only in source → `evidence: "source-only"` (likely outdated source or A/B feature).
- Facts only in console → `evidence: "explored"` (likely added without source update or platform-specific).

This diff is the input to `doc-fact-verifier` — **the doc is then judged against `confirmed` + `explored` facts only**, not against source-only facts.

## Step 6: Stop conditions and idempotency

- **Idempotent**: re-running the skill on the same page must produce a stable JSON (modulo timestamps). Sort arrays by stable keys (id, label).
- **Stop conditions**:
  - All navigation leaves explored OR
  - User explicitly limited scope via `--pages` arg passed in the prompt.
- **Never** stop because a single page failed. Mark blocked, continue.

## Self-check before exit

Before declaring the exploration complete, the agent MUST verify:

- [ ] `navigation-tree.json` exists and has ≥1 leaf.
- [ ] `ui-console-facts.json` validates against `schemas/ui-code-facts.v1.json` — run `node bin/doc-verify.js validate {fact_base}/console-facts/ui-console-facts.json`.
- [ ] `exploration-report.json` lists every page from the nav tree (completed | partial | blocked).
- [ ] No fact has `evidence: "explored"` without a matching screenshot or snapshot reference.
- [ ] `screenshots/` only contains semantically named PNGs; `.yml` and `.log` removed.

If any check fails, fix and re-run that page. Do **not** delegate verification of these checks to the user — the agent is responsible.
