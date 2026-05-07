---
name: doc-fact-verifier
description: Compare documentation claims against a fact base to detect discrepancies, generate a Markdown diff report, and propose revision suggestions. Use when you need to verify if a document accurately describes the product UI.
allowed-tools: Read, Bash(cat:*), Bash(jq:*), Bash(grep:*)
---

# Doc Fact Verifier

## Mission

Compare documentation claims against the merged fact base, detect discrepancies, classify them by severity, and generate a Markdown diff report with revision suggestions.

## Step 0: Read Configuration and Fact Base

1. Read `config/project.json` → determine locale, mode, `fact_base` path
2. Read `{fact_base}/merged-facts/ui-merged-facts.json` (Mode A) or `{fact_base}/console-facts/ui-console-facts.json` (Mode B)
3. Read the target document

## Step 1: Extract Document Claims

### 1.1 Static Claims

Parse the document and extract verifiable claims:

| Claim Type | Pattern | Example |
|-----------|---------|---------|
| Navigation exists | "Click **X** in the sidebar" | Sidebar has "X" menu item |
| Section exists | "On the **X** tab" | Page has "X" tab/section |
| Field exists | "In the **X** field" | Page has "X" input/select |
| Field type | "Select **X** from the dropdown" | Field "X" is a select |
| Option exists | "Options: A, B, C" | Field has options A, B, C |
| Option is only | "Select one of: A, B, C" | These are ALL options |
| Default value | "Default is X" | Field default is X |
| Required field | "Required field" | Field is required |
| Validation rule | "Must be X" | Field validates as X |
| Help text | "Description: X" | Help text says X |
| Limit | "Maximum N items" | Limit is N |

### 1.2 Flow Claims

Extract multi-step operation descriptions:

| Claim Type | Pattern | Example |
|-----------|---------|---------|
| Step exists | "1. Click X" | Flow has step "Click X" |
| Step order | "First X, then Y" | X comes before Y |
| Step count | "3-step process" | Flow has exactly 3 steps |
| Prerequisite | "Before doing X, you must Y" | Y is prerequisite for X |
| Outcome | "After clicking X, Y appears" | X leads to Y |

## Step 2: Match Claims to Facts

### 2.1 Matching Strategy

**Precise matching** (when source facts are available):
- Match by field id, option value, section id
- Use exact string comparison for labels
- Compare option lists as sets

**Fuzzy matching** (when only console facts are available):
- Match by label text similarity
- Use case-insensitive comparison
- Allow minor wording differences

### 2.2 Match Process

For each claim:

1. **Locate target page** in fact base
2. **Find matching element** by label/id
3. **Compare claim value** with fact value
4. **Record result**: ✅ match / ❌ mismatch / ⚠️ partial / 🆕 undocumented

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
