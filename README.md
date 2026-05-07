# doc-verify

> Automated technical documentation verification — fact-check your docs against source code and the live product console.

## Why This Exists

Technical documentation rots. UI labels change, buttons get renamed, options are added or removed — but docs stay stale. Manually clicking through every console page to verify each claim is tedious and error-prone. **doc-verify** automates this: extract facts from source code, verify against the live console, and generate diff reports that tell you exactly what's wrong and how to fix it.

## How It Works

```
Source code ──→ Extract UI facts ──→ Cross-reference ──→ Diff report
                    │                     ↑
                    └── Collection plan ──┘
                                              ↑
Console ──────→ Verify/collect facts ─────────┘
```

**Mode A — Source-enhanced** (when you have source code): Extract facts from the frontend codebase first, then verify a subset against the console. Source code provides 70% of facts; console confirms and fills gaps.

**Mode B — Console-only** (when you don't have source code): Collect all facts directly from the product console. Slower but works for any product.

## Quick Start

**Prerequisites**: Node.js 18+, [Playwright CLI](https://github.com/microsoft/playwright-cli)

```bash
git clone https://github.com/yuanshan8053/doc-verify.git
cd doc-verify

# 1. Initialize a project
node bin/doc-verify.js init

# 2. Install skills to your AI agent
node bin/doc-verify.js install

# 3. Log in to the console
node bin/doc-verify.js login

# 4. Tell your AI agent to verify your docs
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `doc-verify init` | Create a new verification project (interactive) |
| `doc-verify install` | Install skills to AI agent directories |
| `doc-verify login` | Open browser for manual login, save auth state |
| `doc-verify console` | Open browser with saved auth state (one command) |
| `doc-verify login-save` | Save auth state from currently open browser |

## Skills

doc-verify uses 5 Skills that guide your AI agent through the verification workflow:

| Skill | Purpose |
|-------|---------|
| `ui-code-fact-extractor` | Extract UI facts from frontend source code (generic, LLM-driven) |
| `doc-collection-planner` | Generate a collection plan from docs + source facts |
| `console-fact-collector` | Collect or verify facts from the product console via Playwright CLI |
| `doc-fact-verifier` | Compare doc claims against the fact base, generate diff report |
| `doc-console-verifier` | Orchestrate the complete workflow (top-level Skill) |

### Skill Workflow

```
1. Read config → determine mode + fact-base path
2. [Optional] Source code extraction (Mode A)
3. Generate collection plan
4. Console collection/verification
5. Document verification
6. Output diff report
```

## Project Structure

```
doc-verify/
├── bin/doc-verify.js           # CLI tool
├── config/project.json         # Project configuration
├── .playwright/cli.config.json # Playwright CLI config
├── skills/                     # 5 Skill definitions
│   ├── ui-code-fact-extractor/
│   ├── doc-collection-planner/
│   ├── console-fact-collector/
│   ├── doc-fact-verifier/
│   └── doc-console-verifier/
├── fact-base/                  # Generated output (gitignored)
│   └── {product}-{console}-{locale}/
│       ├── meta.json
│       ├── source-facts/       # .json + .md per page
│       ├── console-facts/      # Verification results + screenshots
│       ├── merged-facts/       # Combined fact base
│       └── reports/            # Diff reports
└── package.json
```

### Fact-base Convention

Facts are organized by **product-console-locale** to support multiple products:

```
fact-base/iga-byteplus-en/      # IGA product, BytePlus console, English
fact-base/dcdn-volcengine-zh/   # DCDN product, Volcengine console, Chinese
```

Each fact file has **dual format**:
- `.json` — machine-readable, for programmatic comparison
- `.md` — human-readable, for review and collaboration

## Configuration

### project.json

```json
{
  "project": "iga-docs",
  "console_url": "https://console.byteplus.com/iga",
  "source_code_path": "/path/to/source",
  "docs_path": "/path/to/docs",
  "mode": "source-enhanced",
  "locale": "en",
  "locales": ["zh", "en"],
  "fact_base": "fact-base/iga-byteplus-en"
}
```

### Playwright CLI config

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

> The `--no-sandbox` and `--disable-gpu-sandbox` flags are required when running inside Trae IDE's sandbox. Without them, Chrome's GPU process crashes with `GPU process isn't usable. Goodbye.`

## Console Verification Tips

### Multi-step Forms

Some forms (e.g., "Add domain" wizard) require valid test data to advance through steps. Use these strategies:

| Strategy | How | When to use |
|----------|-----|-------------|
| Reuse + modify | Pick an existing item, change the prefix | Domain ownership verification blocks you |
| API creation | Use the product API to create test resources | API is available |
| Minimal input | Fill only required fields | Simple forms |

### Auth State

- After `state-load`, always `goto` the target URL to refresh the page — auth state doesn't take effect on already-rendered pages
- Auth states expire. If login fails, use `doc-verify login` to re-authenticate

## Sample Output

A diff report looks like this:

```markdown
## Summary

| Metric | Count |
|--------|-------|
| Total claims | 32 |
| Confirmed | 22 |
| Mismatch | 5 |
| Undocumented | 3 |

## C1 — Missing AI scenario documentation [High]

**Document claim**: 4 scenarios (APIs, Web pages, Uploads, Other)
**Console fact**: 6 scenarios in 2 groups (AI services + Generic)
**Recommendation**: Add documentation for AI scenarios
```

## Requirements

- Node.js 18+
- [@playwright/cli](https://github.com/microsoft/playwright-cli) >= 0.1.12
- Chromium browser (installed via `npx playwright-cli install-browser chromium`)
- An AI agent that supports Skills (Claude Code, Trae, Copilot)

## License

Apache-2.0
