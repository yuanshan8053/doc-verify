---
name: doc-fact-verifier
version: 0.2.0
description: Render the final Markdown diff report from an audit-plan produced by doc-collection-planner. Compares documentation claims against a fact base, classifies discrepancies by severity, and proposes specific revisions. Use AFTER audit-plan.json exists.
allowed-tools: Read, Bash(cat:*), Bash(jq:*), Bash(grep:*), Bash(node:*)
---

# Doc Fact Verifier

## Mission

Compare documentation claims against the merged fact base, detect discrepancies, classify them by severity, and generate a Markdown diff report with revision suggestions.

## Step 0: Read inputs

In v0.2.0 this skill consumes the **audit plan** rather than re-deriving claims:

1. Read `config/project.json` → `fact_base`, `locale`, `mode`.
2. Read `{fact_base}/audit-plan.json` (produced by `doc-collection-planner`).
3. Read `{fact_base}/merged-facts/ui-merged-facts.json` (Mode A) or `{fact_base}/console-facts/ui-console-facts.json` (Mode B) for evidence references.
4. Read the target document for verbatim excerpts when generating revision suggestions.

If `audit-plan.json` is missing, return `precondition_missing` and instruct the orchestrator to run `doc-collection-planner` first. **Do not** re-extract claims independently — that path was deprecated in v0.2.0.

## Step 1: Consume the audit plan

The audit plan already contains:

- `claims_audit[]` — every fact, classified as `documented` / `documented_mismatch` / `undocumented`.
- `doc_claims[]` — every doc claim, classified as `fact_supports` / `fact_contradicts` / `fact_missing` / `fact_unknown`, with `severity`.
- `additional_exploration_needed[]` — pages where exploration was incomplete.

Iterate the plan. For every entry, locate the corresponding fact in the fact base by `fact_path` and the corresponding text in the document by `doc_location`. Use these to enrich the report with verbatim excerpts and evidence pointers.

## Step 2: Map audit entries → report findings

Each `doc_claims[]` entry becomes a finding:

| audit `support` | Finding |
|-----------------|---------|
| `fact_supports` | ✅ Pass (record in appendix only) |
| `fact_contradicts` | ❌ Discrepancy — pick discrepancy type from §3 by `claim_type` |
| `fact_missing` (page explored) | ❌ Element not found |
| `fact_unknown` (page partial/blocked) | ⚠️ Cannot verify — escalate |

Each `claims_audit[]` entry with `doc_coverage = "undocumented"` becomes a 🆕 finding.

Each `claims_audit[]` entry with `doc_coverage = "documented_mismatch"` becomes a ❌ finding (cross-checked with `doc_claims[]` to avoid duplicates).

## Step 3: Classify Discrepancies

### 3.1 Static Claim Discrepancies

| Type | Severity | Description |
|------|----------|-------------|
| `label_mismatch` | High | Document label differs from actual |
| `option_missing_in_doc` | High | Actual option not listed in document |
| `option_extra_in_doc` | Medium | Document lists option that doesn't exist |
| `element_not_found` | High | Document describes element that doesn't exist |
| `type_mismatch` | Medium | Document says select, actual is input |
| `default_mismatch` | Medium | Document says default X, actual is Y |
| `required_mismatch` | Medium | Document says required, actual is optional (or vice versa) |
| `validation_mismatch` | High | Document describes different validation than actual |
| `help_text_mismatch` | Low | Help text differs slightly |
| `limit_mismatch` | Medium | Document states different limit than actual |
| `undocumented_element` | Medium | Element exists in UI but not in document |
| `undocumented_section` | Medium | Section exists in UI but not in document |
| `undocumented_option` | Medium | Option exists but not in document |
| `platform_diff_undocumented` | Medium | Platform difference exists but not in document |

### 3.2 Flow Claim Discrepancies

| Type | Severity | Description |
|------|----------|-------------|
| `step_missing` | High | Document omits a step that exists |
| `step_extra` | Medium | Document includes a step that doesn't exist |
| `step_order_changed` | Medium | Steps are in different order |
| `step_label_mismatch` | High | Step description uses wrong label |
| `prerequisite_missing` | High | Document omits a prerequisite |
| `flow_interrupted` | High | Following document steps fails at some point |

## Step 4: Generate Diff Report

Output a Markdown report to `{fact_base}/reports/{doc-name}-diff-report.md`:

```markdown
# Document Verification Report

## Summary
- **Document**: {relative path}
- **Verification time**: {ISO-8601}
- **Fact base**: {source file and timestamp}
- **Mode**: Source-enhanced | Console-only
- **Total claims**: {N}
  - Static claims: {N}
  - Flow claims: {N}
- ✅ **Passed**: {N}
- ❌ **Mismatched**: {N}
- ⚠️ **Partial match**: {N}
- 🆕 **Undocumented**: {N}

## Static Claim Discrepancies

### ❌ [High] {discrepancy_type}
- **Location**: {document section/line}
- **Document says**: {claim description}
- **Actual fact**: {fact description}
- **Evidence**: {fact base reference}
- **Revision suggestion**: {specific fix}

### ⚠️ [Medium] {discrepancy_type}
...

## Flow Claim Discrepancies

### ❌ [High] {discrepancy_type} in flow "{flow_name}"
- **Location**: {document section/line}
- **Document describes**: {step description}
- **Actual flow**: {actual step description}
- **Step status**: {N}/{M} steps match
- **Deviation point**: Step {N}
- **Evidence**: {fact base reference}
- **Revision suggestion**: {specific fix}

## Undocumented Items

### 🆕 [Medium] Undocumented {type}: {name}
- **Found in**: {fact base reference}
- **Description**: {what it is}
- **Suggestion**: Consider documenting this {type}

## Appendix: Verified Facts
{Optional: list of all verified claims that passed, for reference}
```

## Step 5: Generate Revision Suggestions

For each discrepancy, generate a specific, actionable revision suggestion:

- **Label mismatch**: "Change '{doc_label}' to '{actual_label}'"
- **Option missing**: "Add '{actual_option}' to the options list"
- **Option extra**: "Remove '{doc_option}' from the options list (no longer exists)"
- **Step missing**: "Insert step {N}: '{actual_step_description}'"
- **Step order**: "Reorder: {correct_order}"
- **Undocumented**: "Consider adding a section about '{feature}'"

Suggestions should be specific enough to apply directly to the document text.
