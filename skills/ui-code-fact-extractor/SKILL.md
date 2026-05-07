---
name: ui-code-fact-extractor
description: Extract structured UI facts from frontend source code for documentation verification. Use when you need to analyze a frontend codebase to understand what the product's UI actually contains — navigation, fields, options, validation, defaults, platform differences, etc.
allowed-tools: Bash(cat:*), Bash(find:*), Bash(grep:*), Bash(jq:*), Bash(head:*), Bash(wc:*), Read
---

# UI Code Fact Extractor

## Mission

Analyze a frontend source code repository and extract structured facts about the product's UI. Output facts in the standard `ui-code-facts/v1` JSON Schema so downstream tools can compare documentation against reality.

## Step 0: Read Project Configuration

Read the project config file (default: `config/project.json`) to determine:
- `source_code_path`: Root directory of the frontend code
- `locale`: Primary language for the documentation (e.g., "en")
- `locales`: All languages the source code supports (e.g., `["en"]` or `["zh", "en"]`)

If `locales` has only one entry → single-language mode (text fields are `string`).
If `locales` has multiple entries → multi-language mode (text fields are `{lang: string}` objects).

## Step 1: Tech Stack Detection

Scan key files to identify the tech stack before extraction:

1. Read `package.json` → identify framework (react, vue, angular, svelte, etc.), UI library, i18n solution, build tool
2. Scan top-level directory structure → identify routing pattern, component organization pattern
3. Check for config files → identify environment flags, build configuration

Output a brief tech stack summary in `meta.tech_stack`:
```json
{
  "framework": "react | vue | angular | svelte | unknown",
  "language": "typescript | javascript",
  "i18n_solution": "json-key-value | vue-i18n | ngx-translate | i18next | none | unknown",
  "ui_library": "ant-design | element-plus | angular-material | custom | unknown",
  "build_tool": "vite | webpack | next | nuxt | angular-cli | custom | unknown"
}
```

## Step 2: Fact Extraction by Category

For each category below, locate the relevant source files, read them, and extract structured facts. Adapt your search strategy based on the detected tech stack.

### 2.1 Navigation Structure

**What to extract**: Sidebar menu items, top navigation, breadcrumbs.

**Where to look for** (adapt to tech stack):
- Route definitions: React Router config, Vue Router config, Angular Router config, framework-specific config files
- Sidebar/menu component files: look for `Sidebar`, `Menu`, `Nav`, `Sider` component names
- i18n keys for menu labels: search for keys containing `routes`, `menu`, `nav`, `sidebar`

**Extraction strategy**:
1. Find the route/navigation configuration file
2. Extract each route entry: path, label (resolve i18n keys to actual text), icon
3. Build a tree structure reflecting the navigation hierarchy

**Output**: `navigation.items[]` array

### 2.2 Page Structure

**What to extract**: Page titles, tab/section organization, layout patterns.

**Where to look for**:
- Page-level component files in `pages/` or `views/` directories
- Tab/Section/Anchor components: `Tabs`, `TabPane`, `Anchor`, `BlockSection`, `Panel`, `Collapse`
- Layout components: `MasterDetail`, `Wizard`, `Steps`

**Extraction strategy**:
1. Identify page components from route config
2. Read each page component's JSX/template
3. Extract section/tab structure from component composition
4. Note layout patterns (wizard, master-detail, simple form, list+detail)

**Output**: `pages.{path}.sections[]` and `pages.{path}.title`

### 2.3 Field Definitions & Enums

**What to extract**: Form field labels, types, required status, dropdown options, option labels.

**Where to look for**:
- TypeScript interfaces/types for form data: `interface`, `type` definitions
- Enum/Map/Record/constant definitions for dropdown options: `Map`, `Record`, `const object`, `enum`
- i18n keys for field labels: keys containing `field`, `label`, `placeholder`, `form`
- Form schema definitions: JSON Schema, Yup, Zod, Joi schemas

**Extraction strategy**:
1. Find typing files (`typing.ts`, `types.ts`, `interfaces.ts`) or inline type definitions
2. Find option maps (search for `Map`, `Record`, `const` objects with label/value pairs)
3. Resolve i18n keys to actual text
4. For each field: id, label, type (input/select/switch/radio/checkbox), required, options[], default

**Output**: `pages.{path}.fields[]` with nested `options[]`

### 2.4 Validation Rules

**What to extract**: Input validation patterns, required field markers, error messages.

**Where to look for**:
- Validation functions: `validate`, `validator`, `rules`, `check`
- Regular expressions for input patterns: `RegExp`, `/pattern/`, `new RegExp`
- Error message definitions: i18n keys for error messages, inline error strings
- Required field markers: `required: true`, `rules: [{ required }]`

**Extraction strategy**:
1. Search for validation-related code near form components
2. Extract regex patterns and their human-readable descriptions
3. Extract error messages (resolve i18n keys)
4. Note which fields are required

**Output**: `pages.{path}.validation[]`

### 2.5 Default Values

**What to extract**: Form default values, conditional defaults based on platform/environment.

**Where to look for**:
- Default value objects: `DefaultValue`, `initialValues`, `defaultFormValues`, `defaultState`
- Conditional defaults: ternary expressions with platform flags, `IS_BYTEPLUS ? x : y`
- Fallback values: `||`, `??` operators in form initialization

**Extraction strategy**:
1. Search for default value constant definitions
2. Note any conditional logic (platform flags, environment variables)
3. Record both the default value and any conditions

**Output**: `pages.{path}.fields[].default` and `pages.{path}.platform_diffs[]`

### 2.6 Help Texts & Tooltips

**What to extract**: Tooltip content, description text, placeholder text, help icons.

**Where to look for**:
- Tooltip/desc/description properties on components
- Help text components: `Tooltip`, `Popover`, `HelpText`
- Placeholder text in form fields
- i18n keys for help content: keys containing `tip`, `help`, `desc`, `tooltip`, `placeholder`

**Extraction strategy**:
1. Search for tooltip/help components and properties
2. Resolve i18n keys to actual text
3. Associate help text with the target field/section

**Output**: `pages.{path}.help_texts[]`

### 2.7 Platform/Environment Differences

**What to extract**: Feature flags, conditional rendering, platform-specific configurations.

**Where to look for**:
- Feature flags: `IS_BYTEPLUS`, `IS_PRODUCTION`, `IS_OVERSEAS`, `IS_DOMESTIC`, environment variables
- Conditional rendering: ternary operators with flags, `v-if`, `ngIf`, `{condition && ...}`
- Platform-specific components or configurations
- Environment-based API endpoints

**Extraction strategy**:
1. Search for known flag patterns (grep for `IS_`, `ENABLE_`, `FEATURE_`)
2. Find conditional branches that affect UI rendering
3. Document both branches with their conditions
4. Note which fields/components differ between platforms

**Output**: `pages.{path}.platform_diffs[]`

### 2.8 API Interfaces

**What to extract**: API function names, HTTP methods, endpoint paths, request/response types.

**Where to look for**:
- API request functions in `api/`, `services/`, `http/` directories
- TypeScript types for request/response
- API endpoint definitions: URL patterns, method decorators
- HTTP client wrappers: axios, fetch, HttpClient calls

**Extraction strategy**:
1. Scan API directory for request function definitions
2. Extract function name, HTTP method, URL path
3. Extract associated TypeScript types
4. Note any platform-specific endpoints

**Output**: `api_interfaces[]`

### 2.9 Operation Limits

**What to extract**: Maximum counts, length limits, quota displays.

**Where to look for**:
- Hardcoded numeric constants near validation: `50`, `100`, `maxLength`, `maxCount`
- Validation constraints: `min`, `max`, `maxLength`, `minLength`
- Quota/rate limit displays in UI components
- Error messages about limits

**Extraction strategy**:
1. Search for numeric constants in validation and form code
2. Look for `max`, `maxLength`, `limit` keywords
3. Extract the limit value and its description

**Output**: `pages.{path}.limits[]`

### 2.10 Operation Flows

**What to extract**: Multi-step workflows, wizard sequences, modal dialog flows.

**Where to look for**:
- Step/wizard components: `Steps`, `Step`, `Wizard`, `Stepper`
- Sequential form submissions: multiple form pages in sequence
- Modal/dialog workflows: `Modal`, `Dialog` with form content
- State machine definitions: state transitions in create/update/delete flows

**Extraction strategy**:
1. Search for step/wizard components
2. Extract step order and descriptions
3. Identify the flow type (wizard, modal, sequential)
4. Note any conditional steps (platform-dependent, state-dependent)

**Output**: `pages.{path}.flows[]`

## Step 3: Confidence Self-Assessment

After extraction, assess overall confidence:

| Level | Criteria |
|-------|----------|
| **high** | Tech stack well-known, i18n files found, type definitions complete, >80% of expected facts extracted |
| **medium** | Tech stack identified, some i18n missing, partial type definitions, 50-80% of facts extracted |
| **low** | Tech stack unclear, no i18n, no type definitions, <50% of facts extracted, significant guessing |

Also assess per-category confidence if it varies significantly.

## Step 4: Output Format

Output a single JSON object conforming to the `ui-code-facts/v1` schema. Save to `{fact_base}/source-facts/{page-name}.json`.

**Dual-format output**: Also generate a human-readable Markdown version at `{fact_base}/source-facts/{page-name}.md`. The MD file should contain the same facts organized in tables, lists, and sections that a human reviewer can easily scan. Use the JSON file name as the base name for the MD file (e.g., `cache-control.json` → `cache-control.md`).

**Path convention**: `{fact_base}` is read from `config/project.json` → `fact_base` field. Default: `fact-base/{product}-{console}-{locale}/`.

### Schema: `ui-code-facts/v1`

```json
{
  "$schema": "ui-code-facts/v1",
  "meta": {
    "extraction_time": "ISO-8601 timestamp",
    "source_repo": "path to source code",
    "tech_stack": {
      "framework": "string",
      "language": "string",
      "i18n_solution": "string",
      "ui_library": "string",
      "build_tool": "string"
    },
    "extraction_confidence": "high | medium | low",
    "locale": "primary locale string | 'multi'",
    "locales": ["array of locale codes"]
  },
  "navigation": {
    "items": [
      {
        "id": "unique id",
        "label": "string | {lang: string}",
        "path": "route path",
        "icon": "icon name or null",
        "children": []
      }
    ]
  },
  "pages": {
    "/page-path": {
      "title": "string | {lang: string}",
      "source_file": "relative path to page component",
      "sections": [
        {
          "id": "section id",
          "title": "string | {lang: string}",
          "type": "tab | section | panel | wizard-step | collapse",
          "source_file": "relative path to section component"
        }
      ],
      "fields": [
        {
          "id": "field id",
          "label": "string | {lang: string}",
          "type": "input | select | switch | radio | checkbox | textarea | number | date | slider | color",
          "required": true,
          "options": [
            { "value": "string", "label": "string | {lang: string}" }
          ],
          "default": "value or null",
          "placeholder": "string | {lang: string} or null",
          "source_file": "relative path"
        }
      ],
      "actions": [
        {
          "id": "action id",
          "label": "string | {lang: string}",
          "type": "button | link | icon-button",
          "disabled_condition": "description or null"
        }
      ],
      "validation": [
        {
          "field": "field id",
          "rule": "human-readable description",
          "regex": "regex pattern or null",
          "error_message": "string | {lang: string} or null"
        }
      ],
      "limits": [
        {
          "description": "what is limited",
          "value": "number or string",
          "source_file": "relative path"
        }
      ],
      "help_texts": [
        {
          "target": "field id or section id",
          "content": "string | {lang: string}",
          "type": "tooltip | description | placeholder | help-icon"
        }
      ],
      "platform_diffs": [
        {
          "flag": "feature flag name",
          "field": "affected field id",
          "description": "what differs",
          "value_a": { "platform": "name", "value": "value" },
          "value_b": { "platform": "name", "value": "value" }
        }
      ],
      "flows": [
        {
          "id": "flow id",
          "name": "string | {lang: string}",
          "type": "wizard | modal | sequential | state-machine",
          "steps": [
            {
              "order": 1,
              "description": "string | {lang: string}",
              "source_file": "relative path or null"
            }
          ]
        }
      ]
    }
  },
  "api_interfaces": [
    {
      "name": "function name",
      "method": "GET | POST | PUT | DELETE | PATCH",
      "path": "API path pattern",
      "request_type": "TypeScript type name or null",
      "response_type": "TypeScript type name or null",
      "source_file": "relative path"
    }
  ]
}
```

### Language field rules

- If `locales` has 1 entry (e.g., `["en"]`): all text fields are plain `string`
- If `locales` has multiple entries (e.g., `["zh", "en"]`): all text fields are `{lang: string}` objects

Example single-language: `"label": "Rule type"`
Example multi-language: `"label": {"zh": "规则类型", "en": "Rule type"}`

## Extraction Heuristics

Common patterns across tech stacks to guide your search:

### i18n patterns
- JSON key-value files: look for `locales/`, `i18n/`, `lang/`, `messages/` directories
- Key naming: usually hierarchical like `iga/routes/instances`, `pages/domain/ruleType`
- Fallback files: `fallback/en.json` usually contains the complete key set

### Enum/option patterns
- TypeScript: `const Map = { key: { value, label } }` or `type X = 'a' | 'b' | 'c'`
- Vue: `reactive({ ... })` or `computed(() => [...])`
- Angular: `enum X { A, B }` or constant arrays
- Usually co-located with the component that uses them (in `util.ts`, `constant.ts`, `config.ts`)

### Validation patterns
- Usually co-located with form definitions
- Common names: `validate`, `rules`, `validator`, `check`, `pattern`
- Regex patterns often stored in named constants like `RuleReg`, `PATTERN_*`

### Default value patterns
- Usually defined as constants near the form component
- Common names: `DefaultValue`, `initialValues`, `defaultFormValues`
- Conditional defaults use ternary with platform flags

### Platform flag patterns
- Usually defined in config/env files or as global constants
- Common names: `IS_BYTEPLUS`, `IS_OVERSEAS`, `IS_PRODUCTION`, `ENABLE_*`
- Used in ternary expressions, conditional rendering, or config objects

### Large codebase strategy
- Do NOT try to read every file. Use directory scanning and grep to locate relevant files first.
- Extract one page at a time, starting from the pilot page specified in config.
- For each page, focus on: main component → typing file → util/constants → i18n keys
- Skip files that are clearly unrelated (styles, tests, assets)
