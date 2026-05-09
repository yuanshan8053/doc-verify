---
name: doc-collection-planner
version: 0.2.0
description: Build an audit plan that crosswalks a document against an already-collected fact base. Facts are the input; the document is the suspect. Use AFTER console-explorer has produced ui-console-facts.json (or after merged-facts in Mode A).
allowed-tools: Read, Bash(cat:*), Bash(find:*), Bash(grep:*), Bash(jq:*), Bash(node:*)
---

# Doc Collection Planner (v2 — fact-driven)

## Mission

Produce an audit plan that lists, for every fact, whether the document mentions it; and for every document claim, whether a fact supports it. The plan does **not** drive console navigation — that work was already done by `console-explorer`.

## Inversion vs v1

v1 read the document first and then planned what to verify. That made the document the source of truth, which is the opposite of the goal. v2 reads facts first and treats the document as a hypothesis to audit.

## Step 0: Read inputs

Read `config/project.json`:
- `fact_base` → root for inputs and outputs
- `docs_path` + the target doc(s)
- `mode`

Read facts (in priority order, take whichever exists):
1. `{fact_base}/merged-facts/ui-merged-facts.json` (Mode A)
2. `{fact_base}/console-facts/ui-console-facts.json` (Mode B)

If neither exists → return `precondition_missing` and instruct the orchestrator to run `console-explorer` first. **Do not** attempt to plan from the document alone — that re-introduces the v1 failure mode.

Read `{fact_base}/console-facts/exploration-report.json` to know which pages are `partial`/`blocked`.

## Step 1: Iterate facts → find doc coverage

For every fact in the fact base (navigation items, pages, sections, fields, options, validation, defaults, help text, limits, flows, platform diffs):

1. Search the document text for references to the fact (label, id, synonym).
2. Classify coverage:
   - `documented` — fact mentioned with matching value
   - `documented_mismatch` — fact mentioned but value differs (high-priority finding)
   - `undocumented` — fact never mentioned (medium-priority finding)
3. For `documented_mismatch`, capture both sides verbatim.

Skip facts with `evidence: "source-only"` — those are not authoritative for documentation audit.

Output: `claims_audit[]`.

## Step 2: Iterate doc → find fact support

Parse the document for verifiable claims (see Claim Patterns below). For each claim:

1. Look up the corresponding fact.
2. Classify support:
   - `fact_supports` — claim matches a fact
   - `fact_contradicts` — claim contradicts a fact (high-priority finding)
   - `fact_missing` — no fact found, AND exploration covered the page → claim is suspicious (medium)
   - `fact_unknown` — no fact found, AND the page is `partial`/`blocked` → flag for additional exploration (low)

Output: `doc_claims[]`.

### Claim patterns

| Claim Type | Pattern | Locator in fact base |
|-----------|---------|----------------------|
| Navigation exists | "Click **X** in the sidebar" | `navigation.items[]` |
| Section exists | "On the **X** tab" | `pages.{path}.sections[]` |
| Field exists | "In the **X** field" | `pages.{path}.fields[]` |
| Field type | "Select **X** from the dropdown" | `pages.{path}.fields[].type` |
| Option exists | "Options: A, B, C" | `pages.{path}.fields[].options[]` |
| Option exhaustive | "Select one of: A, B, C" | options as a set |
| Default value | "Default is X" | `pages.{path}.fields[].default` |
| Required | "Required field" | `pages.{path}.fields[].required` |
| Validation | "Must match X" | `pages.{path}.validation[]` |
| Help text | "Description: X" | `pages.{path}.help_texts[]` |
| Limit | "Maximum N items" | `pages.{path}.limits[]` |
| Flow step | "1. Click X" | `pages.{path}.flows[].steps[]` |
| Step order | "First X, then Y" | `flows[].steps[].order` |
| Step count | "3-step process" | `flows[].steps.length` |

## Step 3: Identify exploration gaps

For pages marked `partial` or `blocked` in exploration-report:

- If the document makes claims about these pages, mark `additional_exploration_needed`.
- Recommend a `recovery_strategy` per blocked page: which Test Data Strategy to retry, or which prerequisite to satisfy.

## Step 4: Output audit plan

Write `{fact_base}/audit-plan.json`. The output validates against `schemas/audit-plan.v1.json`:

```json
{
  "$schema": "audit-plan/v1",
  "plan_id": "ap-{timestamp}",
  "source_doc": "relative/path/to/doc.md",
  "fact_base_snapshot": {
    "facts_file": "merged-facts/ui-merged-facts.json | console-facts/ui-console-facts.json",
    "explored_at": "ISO-8601",
    "pages_completed": 22,
    "pages_partial": 2,
    "pages_blocked": 0
  },
  "claims_audit": [
    {
      "id": "ca-001",
      "fact_path": "pages./caching.fields.rule_type",
      "fact_summary": "select with options [path, file, ext]",
      "doc_coverage": "documented | documented_mismatch | undocumented",
      "doc_locations": ["section header / line range"],
      "doc_says": "verbatim excerpt or null",
      "evidence": "explored | confirmed | source-only"
    }
  ],
  "doc_claims": [
    {
      "id": "dc-001",
      "claim_type": "option_exhaustive",
      "doc_location": "section / line",
      "doc_says": "Select one of: path, file, ext",
      "fact_path": "pages./caching.fields.rule_type.options",
      "fact_says": "[path, file, ext, regex]",
      "support": "fact_supports | fact_contradicts | fact_missing | fact_unknown",
      "severity": "high | medium | low"
    }
  ],
  "additional_exploration_needed": [
    {
      "page": "/iga/domains/add",
      "reason": "wizard step 3 was blocked by ownership verification",
      "recovery_strategy": "Strategy A: pick existing domain, modify prefix"
    }
  ]
}
```

## Step 5: Hand off

Print a one-line summary to stdout:

```
audit-plan written: {fact_base}/audit-plan.json — N claims_audit, M doc_claims, K gaps
```

The orchestrator passes this plan to `doc-fact-verifier` for final report generation.

## Self-check before exit

- [ ] `claims_audit[]` covers every fact except those with `evidence: "source-only"`.
- [ ] `doc_claims[]` covers every claim pattern listed in Step 2.
- [ ] `additional_exploration_needed[]` includes every `partial`/`blocked` page that the doc references.
- [ ] Output validates: `node bin/doc-verify.js validate {fact_base}/audit-plan.json`.
