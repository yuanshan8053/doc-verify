---
name: console-fact-collector
version: 0.2.0
description: Collect or verify UI facts from a product console using Playwright CLI. In v2, the dominant pattern is exploration (delegated to console-explorer); this skill handles targeted verification, test-data-driven flows, and fact merging. Includes a "fail → pivot" decision table so the agent never stalls when a doc-driven step fails.
allowed-tools: Bash(npx:*), Bash(node:*), Bash(jq:*), Read
---

# Console Fact Collector

## Mission

Use Playwright CLI to collect or verify UI facts from a product console. In Mode A (source-enhanced), perform targeted verification of source code facts. In Mode B (console-only), perform full collection of all UI facts.

## Step 0: Read Configuration

1. Read `config/project.json` → determine mode, console URL, `fact_base` path
2. Read `{fact_base}/collection-plan.json` → determine what to verify/collect
3. If Mode A: Read `{fact_base}/source-facts/*.json` → reference facts

**Path convention**: `{fact_base}` is read from `config/project.json` → `fact_base` field. Format: `fact-base/{product}-{console}-{locale}/`. Example: `fact-base/iga-byteplus-en/`.

## Step 1: Session Setup

### 1.1 Open Browser with Persistent Session

```bash
npx @playwright/cli@latest open --browser chromium --config=.playwright/cli.config.json
```

**Important — Trae IDE sandbox compatibility**: When running inside Trae IDE's sandbox, Chrome's GPU process and sandbox will crash due to permission restrictions. The `.playwright/cli.config.json` must include `--no-sandbox` and `--disable-gpu-sandbox` in `launchOptions.args`:

```json
{
  "browser": {
    "browserName": "chromium",
    "isolated": false,
    "userDataDir": ".playwright/profile",
    "launchOptions": {
      "headless": false,
      "args": ["--no-sandbox", "--disable-gpu-sandbox", "--disable-dev-shm-usage"]
    }
  }
}
```

Without these flags, the browser will crash with: `GPU process isn't usable. Goodbye.`

### 1.2 Load Auth State (if saved)

```bash
npx @playwright/cli@latest state-load {fact_base}/auth-state.json
```

**Important**: After `state-load`, the page does NOT automatically reflect the new auth state. You MUST navigate to the target URL (or reload) to trigger a fresh page load that reads the injected cookies:

```bash
npx @playwright/cli@latest goto {console_url}
# Then verify login state
```

### 1.3 Verify Login

```bash
npx @playwright/cli@latest snapshot
# Check if snapshot shows logged-in page, not login form
# If login form → need manual login (inform user)
```

**Auth state expiry**: Auth states expire. If `state-load` + `goto` still shows a login form:
1. Inform user: "Auth state expired. Please log in manually."
2. Wait for user to complete login in the browser
3. After login, save new state: `npx @playwright/cli@latest state-save {fact_base}/auth-state.json`
4. Continue verification

## Step 2: Mode A — Sampling Verification

### 2.1 Generate Verification Checklist

From `collection-plan.json`, extract items where `verification_needed: true`:

- Navigation items not found in source
- Fields with `low` confidence
- Options that source contradicts
- Platform differences to verify
- Dynamic content areas

### 2.2 Execute Verification

For each verification item:

**Verify navigation item**:
```bash
npx @playwright/cli@latest snapshot
# Check if navigation item exists in snapshot
```

**Verify field/option**:
```bash
npx @playwright/cli@latest goto {page_url}
npx @playwright/cli@latest snapshot
# Check if field exists, click dropdowns to verify options
npx @playwright/cli@latest click {dropdown_ref}
npx @playwright/cli@latest snapshot
```

**Verify platform difference**:
```bash
npx @playwright/cli@latest screenshot
```

**Verify dynamic content**:
```bash
npx @playwright/cli@latest snapshot
npx @playwright/cli@latest screenshot
```

### 2.3 Record Verification Results

For each verified item, record:
- `verified`: true/false
- `console_value`: actual value found in console
- `matches_source`: true/false (compared to source facts)

## Step 3: Mode B — Full Collection

### 3.1 Collect Navigation Structure

```bash
npx @playwright/cli@latest snapshot
npx @playwright/cli@latest screenshot
```

Extract all menu items, their labels, and paths.

### 3.2 Collect Page Structure (for each page)

```bash
npx @playwright/cli@latest goto {page_url}
npx @playwright/cli@latest snapshot
npx @playwright/cli@latest screenshot
```

Extract sections, tabs, field groups.

### 3.3 Collect Field Details

For each field on the page:
```bash
# For dropdown/select fields — click to expand options
npx @playwright/cli@latest click {select_ref}
npx @playwright/cli@latest snapshot

# For switch/checkbox fields — note current state
npx @playwright/cli@latest snapshot {section_ref}
```

### 3.4 Collect Flow States (State Machine Mode)

For each operation flow:

```bash
# Step 0: Record initial state
npx @playwright/cli@latest snapshot
npx @playwright/cli@latest screenshot

# Step N: Execute action, record post-action state
npx @playwright/cli@latest click {target_ref}
npx @playwright/cli@latest snapshot
npx @playwright/cli@latest screenshot
```

**Failure handling**: If an action fails:
1. Record the failure: `action_result: "failed"`, `failure_reason: "..."`
2. Take snapshot + screenshot of current state
3. Enter exploration mode:
   - Get current page snapshot
   - Look for similar elements (fuzzy match by text)
   - If found, record deviation and continue
   - If not found, mark as "needs human intervention" and skip
4. Continue with next step if possible

### 3.5 Rollback Test Data (L2 Safe Write)

After completing flows that created test data:
```bash
# Delete test resources created during verification
npx @playwright/cli@latest click {delete_ref}
```

## Step 4: Output Console Facts

### Mode A Output

Save verification results to `{fact_base}/console-facts/verification-results.json`:

```json
{
  "verification_time": "ISO-8601",
  "mode": "sampling",
  "items_verified": 15,
  "items_confirmed": 12,
  "items_contradicted": 2,
  "items_not_found": 1,
  "results": [
    {
      "claim_id": "claim-001",
      "verified": true,
      "console_value": "actual value",
      "matches_source": true
    }
  ]
}
```

### Mode B Output

Save full console facts to `{fact_base}/console-facts/ui-console-facts.json` using the same `ui-code-facts/v1` schema.

### Screenshot naming convention

Save meaningful screenshots to `{fact_base}/console-facts/screenshots/` with **semantic names** (not timestamps):
- `domain-list.png` — Domain list page
- `scene-selector.png` — Scene selector component
- `api-recommended-configs.png` — API recommended configurations
- `caching-tab.png` — Caching configuration tab

### Process file cleanup

After each collection session:
- **Delete** `.yml` snapshots and `.log` files — these are process artifacts
- **Keep** only: verification JSON, semantically named screenshots, and merged facts
- This keeps the fact-base clean and human-friendly

## Step 5: Merge Facts (Mode A Only)

Merge source facts and console facts:

**Rules**:
1. Source facts are the base
2. Console facts override for dynamic content
3. If source and console conflict → console wins (live > code)
4. Record all conflicts in `verification-results.json`

Save merged facts to `{fact_base}/merged-facts/ui-merged-facts.json`.

## Fail → Pivot Decision Table ⭐ (v0.2.0)

> **Core rule**: when a doc-driven step fails, the agent MUST pivot — never re-try the same failing step more than 2× and never abandon the page silently. The whole point of this project is to find doc bugs; a failure IS a finding, but only if you keep going to confirm it.

The agent consults this table whenever a Playwright action does not produce the expected snapshot result.

| Symptom on console | Likely cause | Pivot action (in order) | Record as |
|---|---|---|---|
| Click target by text not found | Doc uses wrong button label | 1. `eval` to dump all `role=button` text on the page<br>2. Fuzzy-match by lowercase + token-set<br>3. If a single close match (≥0.7) exists, click it and continue | `discrepancy: label_mismatch` (HIGH) — record both doc label and actual label |
| Click target appears multiple times | Ambiguous reference in doc | 1. Disambiguate by parent section / nearest heading<br>2. Prefer the one inside the section the doc currently describes | `discrepancy: ambiguous_reference` (LOW) |
| Field exists but wrong type (doc says select, actual is input) | UI changed type | Snapshot field, capture actual `role`, continue with type-appropriate input | `discrepancy: type_mismatch` (MEDIUM) |
| Dropdown options differ from doc | Options were added/removed | Open dropdown, snapshot all `role=option`, compare set | `discrepancy: option_*_in_doc` |
| Form validation blocks Next | Doc steps are insufficient or wrong order | 1. Read validation message verbatim<br>2. Apply Test Data Strategy A (reuse existing) → C (minimal input)<br>3. If still blocked, apply Strategy B (API) | If 3 strategies fail → `flow_blocked` (HIGH) with the validation message |
| Wizard step count differs | Steps added/removed in product | Capture all step labels via `role="navigation"` indicator; do not rely on doc step count | `discrepancy: step_missing` or `step_extra` (HIGH) |
| Step order differs | Reordered in product | Continue executing in actual order (not doc order) | `discrepancy: step_order_changed` (MEDIUM) |
| Element only appears after toggling another | Conditional rendering not in doc | Toggle the parent and re-snapshot; record the dependency | `discrepancy: conditional_field_undocumented` (MEDIUM) |
| Page redirects unexpectedly | URL changed or feature removed | Capture redirect chain via `eval`; do not follow doc URL further | `discrepancy: page_relocated` or `element_not_found` (HIGH) |
| Auth required mid-flow | Step requires extra permission | Stop the flow, surface `auth_required_for_step`, do NOT log out the agent | `flow_blocked` with `cause: insufficient_permission` |
| Snapshot returns empty / timeout | Slow page or in-flight XHR | `eval document.readyState === 'complete'` + 2s grace, retry once | If still empty → `page_unresponsive`, mark `partial`, move on |
| Same step fails twice | Either pivot worked once (great) or path is dead | After 2 attempts on the SAME action, **abandon the doc-driven path and switch to `console-explorer`** for this page | `flow_blocked`, then `recovery: explorer_invoked` |

### Recovery loop (mandatory)

```
attempt N
  ├─ success → continue
  └─ fail
       ├─ N < 2 → pivot via table above, attempt N+1
       └─ N ≥ 2 → mark page partial, invoke console-explorer for this page, stop driving from doc
```

**Do not** sit in a retry loop. **Do not** silently move to the next claim. **Do not** delete the failed claim from the plan — it becomes the most valuable finding (a doc bug).

### Failure recording schema

Every pivot must produce an entry in `{fact_base}/console-facts/flow-deviations.json`:

```json
{
  "claim_id": "claim-007",
  "doc_says": "Click \"Save changes\"",
  "console_actual": "Button labeled \"Save\" only",
  "pivot_action": "fuzzy_match_token_set",
  "pivot_outcome": "succeeded",
  "discrepancy_type": "label_mismatch",
  "severity": "high",
  "evidence_screenshot": "screenshots/save-button.png"
}
```

This file is the input to `doc-fact-verifier` for the "doc-driven failures" section of the diff report.

## Test Data Strategy

| Level | Strategy | When to use |
|-------|----------|-------------|
| L1 Read-only | Only observe, no input | List pages, detail pages, monitoring |
| L2 Safe write | Create + delete test data | Add domain → delete, create rule → delete |
| L3 Exploratory | Try to infer correct path when document is wrong | Document outdated, steps missing |

### L2 Test Data Preparation

For multi-step forms (e.g., "Add domain" wizard), you need valid test data to pass form validation and advance through steps. Strategies:

**Strategy A — Reuse existing data with modifications**:
1. Go to the list page (e.g., domain list)
2. Pick an existing item (e.g., an existing domain)
3. Derive test input from it (e.g., change the prefix of an existing domain name)
4. This often bypasses ownership verification steps

**Strategy B — Use API to create test data**:
1. If the product has an API, use it to create test resources programmatically
2. Then verify the UI reflects the created data

**Strategy C — Minimal input approach**:
1. Fill only required fields with the simplest valid values
2. Skip optional fields
3. If a field requires external verification (e.g., DNS TXT record), try Strategy A instead

**Common pitfalls**:
- Domain ownership verification (TXT record) cannot be completed automatically
- Some forms require selecting from dropdowns populated by API calls — wait for data to load
- Origin server / source station fields often require valid IP or domain format
- Certificate-related forms may require cross-service authorization

### Flow Verification Strategy

When verifying multi-step wizard flows:

1. **Step-by-step snapshots**: Take snapshot + screenshot at each step
2. **Button label verification**: Use `eval` to extract button text from the DOM, not just visual inspection
3. **If stuck on a step**: Record what blocked you, note it in the report, and rely on source code facts for that step
4. **Partial verification is acceptable**: If you can verify Steps 1 and 3 but not Step 2, record Steps 1 and 3 as confirmed and Step 2 as "source-code-only confidence"

## Session Management

```bash
# List active sessions
npx @playwright/cli@latest list

# Close all sessions
npx @playwright/cli@latest close-all
```

## Save Auth State

After manual login, save the state for reuse:
```bash
npx @playwright/cli@latest state-save {fact_base}/auth-state.json
```
