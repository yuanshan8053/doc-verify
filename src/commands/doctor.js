"use strict";

/**
 * `doc-verify doctor` — preflight environment check.
 *
 * Verifies:
 *   - Node version ≥ 18
 *   - Playwright CLI binary callable + version printable
 *   - config/project.json exists and is valid (if cwd has one)
 *   - .playwright/cli.config.json contains required sandbox flags
 *   - schemas dir is reachable
 *   - ajv installed (warn-only)
 */

const fs = require("fs");
const path = require("path");
const pw = require("../lib/playwright-cli");
const { load } = require("../lib/config");
const { schemasDir, SCHEMA_BY_KEY } = require("../lib/schema");

function nodeOk() {
  const m = process.versions.node.match(/^(\d+)/);
  return m && parseInt(m[1], 10) >= 18;
}

async function run(flags, log, cwd) {
  let problems = 0;
  function ok(label, fields) {
    log.info(`✓ ${label}`, fields);
  }
  function fail(label, hint) {
    problems++;
    log.error(`✗ ${label}`, hint ? { hint } : undefined);
  }

  // Node
  if (nodeOk()) ok("Node ≥ 18", { actual: process.versions.node });
  else fail(`Node ≥ 18 (have ${process.versions.node})`, "Upgrade Node to 18+");

  // Playwright CLI
  const v = pw.version({ cwd });
  if (v) ok("Playwright CLI callable", { version: v, pin: pw.PIN });
  else
    fail(
      "Playwright CLI not callable",
      "Install with: npx @playwright/cli@^0.1 --version (this also primes the npm cache)"
    );

  // Project config (optional)
  const cfgPath = path.join(cwd, "config", "project.json");
  if (fs.existsSync(cfgPath)) {
    try {
      load(cwd);
      ok("config/project.json valid");
    } catch (e) {
      fail(`config/project.json invalid: ${e.message}`, e.hint);
    }
  } else {
    log.info("- config/project.json not present (run `doc-verify init` to create one)");
  }

  // Playwright config — sandbox flags
  const pwConfig = path.join(cwd, ".playwright", "cli.config.json");
  if (fs.existsSync(pwConfig)) {
    try {
      const j = JSON.parse(fs.readFileSync(pwConfig, "utf-8"));
      const args = (((j.browser || {}).launchOptions || {}).args) || [];
      const hasNoSandbox = args.includes("--no-sandbox");
      const hasNoGpu = args.includes("--disable-gpu-sandbox");
      if (hasNoSandbox && hasNoGpu) ok("Sandbox flags present");
      else fail("Sandbox flags missing in .playwright/cli.config.json", "Add --no-sandbox and --disable-gpu-sandbox to launchOptions.args");
      // P4: warn if userDataDir is still set (legacy)
      if (j.browser && j.browser.userDataDir) {
        log.warn("Legacy userDataDir present — consider removing it (auth-state.json is the single source of truth)", {
          file: ".playwright/cli.config.json",
        });
      }
    } catch (e) {
      fail(`Cannot parse ${pwConfig}: ${e.message}`);
    }
  }

  // Schemas
  const sd = schemasDir();
  if (fs.existsSync(sd)) {
    const have = Object.values(SCHEMA_BY_KEY).filter((f) => fs.existsSync(path.join(sd, f)));
    if (have.length === Object.keys(SCHEMA_BY_KEY).length) ok("Schemas present", { count: have.length });
    else fail(`Schemas incomplete (have ${have.length}/${Object.keys(SCHEMA_BY_KEY).length})`, "Run from the doc-verify repo root, or reinstall");
  } else {
    fail("Schemas dir not found", `Expected ${sd}`);
  }

  // ajv
  try {
    require.resolve("ajv");
    ok("ajv installed");
  } catch {
    log.warn("- ajv not installed (validation will use shallow type-check fallback). To enable full schema validation: npm i ajv ajv-formats");
  }

  if (problems) {
    process.exitCode = 1;
    log.warn(`${problems} problem(s) detected`);
  } else {
    log.info("All checks passed");
  }
}

module.exports = { run };
