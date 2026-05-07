---
name: doc-collection-planner
description: Generate a structured collection plan from documentation and optional source code, to guide fact collection from the product console. Use when you need to plan how to verify a document against the actual product UI.
allowed-tools: Read, Bash(cat:*), Bash(find:*), Bash(grep:*), Bash(jq:*)
---

# Doc Collection Planner

## Mission

Analyze a documentation file and (optionally) source code facts to generate a structured collection plan. The plan defines what facts to verify, where to find them, what test data is needed, and what confidence level each expected fact has.

## Step 0: Read Project Configuration

Read `config/project.json` to determine:
- `source_code_path`: If present → Mode A (source-enhanced), read `{fact_base}/source-facts/*.json`
- `docs_path`: Root directory of documentation files
- `locale`: Primary language for matching
- `locales`: All supported languages
- `fact_base`: Path to fact-base directory (e.g., `fact-base/iga-byteplus-en/`)

## Step 1: Parse the Document

Read the target document and extract:

### 1.1 Static Claims

For each UI element described in the document, extract:
- **Element reference**: What the document calls it (label, name, path)
- **Expected state**: What the document says about it (exists, has options X/Y/Z, default value is V)
- **Location hint**: Where in the document this claim appears (section, line)
- **Confidence**: How certain we are that this claim is accurate
  - `high`: Document is detailed and specific (e.g., "Select from: A, B, C")
  - `medium`: Document is vague or could be interpreted multiple ways
  - `low`: Document is clearly outdated or contradicts other evidence

### 1.2 Flow Claims

For each multi-step operation described in the document, extract:
- **Flow name**: What operation is being described
- **Steps**: Ordered list of actions (click, fill, select, etc.)
- **Expected outcome**: What should happen after the flow
- **Test data needed**: Whether the flow requires input data to execute
- **Confidence**: How certain we are the steps are accurate

### 1.3 Implicit Claims

Claims not explicitly stated but implied by the document:
- If a page is described, it implies the page exists
- If options are listed, it implies those are the ONLY options
- If a step is described, it implies the step is required

## Step 2: Cross-Reference with Source Code Facts (Mode A Only)

If `ui-code-facts.json` exists, cross-reference document claims with source code facts:

### 2.1 Match Claims to Source Facts

For each claim, attempt to find a matching entry in the source facts:
- Navigation claims → match against `navigation.items[]`
- Page structure claims → match against `pages.{path}.sections[]`
- Field claims → match against `pages.{path}.fields[]`
- Option claims → match against `pages.{path}.fields[].options[]`
- Validation claims → match against `pages.{path}.validation[]`
- Default value claims → match against `pages.{path}.fields[].default`
- Help text claims → match against `pages.{path}.help_texts[]`
- Flow claims → match against `pages.{path}.flows[]`

### 2.2 Update Confidence

- If source code confirms the claim → upgrade confidence to `high`
- If source code contradicts the claim → downgrade confidence to `low`, note the discrepancy
- If source code has no matching entry → keep original confidence, mark as `unverified_in_source`

### 2.3 Identify Unknowns

Source code may reveal UI elements not mentioned in the document:
- Sections in source but not in document → mark as `undocumented`
- Fields in source but not in document → mark as `undocumented`
- Platform differences in source but not in document → mark as `undocumented`

## Step 3: Generate Collection Plan

Output a structured collection plan:

```json
{
  "plan_id": "unique-id",
  "source_doc": "relative path to document",
  "mode": "source-enhanced | console-only",
  "target_pages": [
    {
      "path": "/page-path",
      "title": "page title",
      "source_file": "relative path or null"
    }
  ],
  "static_claims": [
    {
      "id": "claim-001",
      "type": "navigation | section | field | option | default | validation | help_text",
      "doc_location": "section name or line reference",
      "doc_description": "what the document says",
      "expected_value": "expected fact value",
      "confidence": "high | medium | low",
      "source_match": "path in ui-code-facts.json or null",
      "source_value": "value from source code or null",
      "source_confirms": true | false | null,
      "verification_needed": true | false,
      "verification_method": "snapshot | screenshot | click_expand | eval"
    }
  ],
  "flow_claims": [
    {
      "id": "flow-001",
      "name": "flow name",
      "doc_location": "section name or line reference",
      "steps": [
        {
          "order": 1,
          "action": "click | fill | select | type | press",
          "target": "element description",
          "value": "input value or null",
          "confidence": "high | medium | low"
        }
      ],
      "test_data_required": true | false,
      "test_data": {
        "field_name": "suggested test value"
      },
      "source_match": "path in ui-code-facts.json or null",
      "verification_needed": true | false
    }
  ],
  "unknowns": [
    {
      "type": "undocumented_section | undocumented_field | undocumented_option | platform_diff",
      "source_reference": "path in ui-code-facts.json",
      "description": "what was found in source but not in document"
    }
  ],
  "console_verification_plan": {
    "pages_to_visit": ["list of pages"],
    "elements_to_expand": ["dropdowns to click open"],
    "screenshots_needed": ["list of pages/elements to screenshot"],
    "flows_to_execute": ["list of flows to test"],
    "test_data_needed": {
      "field_name": "suggested value"
    }
  }
}
```

## Step 4: Determine Verification Strategy

### Mode A (Source-Enhanced)

Only verify claims that:
1. Have `low` confidence (likely outdated)
2. Have no source match (`source_match: null`)
3. Source contradicts (`source_confirms: false`)
4. Involve dynamic content (cannot be verified from source alone)

### Mode B (Console-Only)

Verify all claims through console collection.

## Step 5: Suggest Test Data

For flows that require test data:

1. **From document**: Use example values mentioned in the document
2. **From source code defaults**: Use `fields[].default` values from source facts
3. **From validation rules**: Infer valid values from `validation[]` entries (e.g., if regex requires `/path/`, suggest `/test/`)
4. **Safe values**: Prefer non-destructive test values (e.g., `test-verify.example.com` for domain fields)

## Step 6: Output

Save the collection plan to `{fact_base}/collection-plan.json`.
