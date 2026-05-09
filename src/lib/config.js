"use strict";

/**
 * Configuration loader with non-interactive support.
 *
 * Loading order:
 *   1. Explicit path via `--config <path>` flag.
 *   2. $DOC_VERIFY_CONFIG env var.
 *   3. config/project.json under cwd.
 *
 * Validation: ensures required fields exist; missing/blank values throw with a
 * suggested fix instead of producing silently broken state.
 */

const fs = require("fs");
const path = require("path");

const REQUIRED = ["project", "console_url", "fact_base", "mode", "locale", "locales"];

function defaultPath(cwd) {
  return process.env.DOC_VERIFY_CONFIG || path.join(cwd, "config", "project.json");
}

function load(cwd, explicit) {
  const file = explicit || defaultPath(cwd);
  if (!fs.existsSync(file)) {
    const e = new Error(`Config not found: ${file}`);
    e.code = "ECONFIGNOTFOUND";
    e.hint = "Run `doc-verify init` first, or pass --config <path>";
    throw e;
  }
  let raw;
  try {
    raw = fs.readFileSync(file, "utf-8");
  } catch (err) {
    const e = new Error(`Cannot read config: ${file} (${err.message})`);
    e.code = "ECONFIGREAD";
    throw e;
  }
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (err) {
    const e = new Error(`Invalid JSON in ${file}: ${err.message}`);
    e.code = "ECONFIGPARSE";
    e.hint = "Fix the JSON syntax. Trailing commas / single quotes are not valid JSON.";
    throw e;
  }
  validate(cfg, file);
  return { cfg, file };
}

function validate(cfg, file) {
  const missing = REQUIRED.filter((k) => cfg[k] === undefined || cfg[k] === null || cfg[k] === "");
  if (missing.length) {
    const e = new Error(`Config ${file} is missing required fields: ${missing.join(", ")}`);
    e.code = "ECONFIGINVALID";
    e.hint = `Add these fields and re-run. Sample values:\n${sample()}`;
    throw e;
  }
  if (!Array.isArray(cfg.locales) || cfg.locales.length === 0) {
    const e = new Error(`Config ${file} has invalid locales (must be a non-empty array)`);
    e.code = "ECONFIGINVALID";
    throw e;
  }
  if (!["source-enhanced", "console-only"].includes(cfg.mode)) {
    const e = new Error(`Config ${file} has invalid mode "${cfg.mode}"`);
    e.code = "ECONFIGINVALID";
    e.hint = `mode must be "source-enhanced" or "console-only"`;
    throw e;
  }
  // Cross-check: source-enhanced requires source_code_path.
  if (cfg.mode === "source-enhanced" && !cfg.source_code_path) {
    const e = new Error(`mode=source-enhanced requires source_code_path`);
    e.code = "ECONFIGINVALID";
    e.hint = `Set source_code_path to your frontend repo root, or change mode to console-only.`;
    throw e;
  }
}

function sample() {
  return JSON.stringify(
    {
      project: "my-product",
      console_url: "https://console.example.com",
      source_code_path: null,
      docs_path: null,
      mode: "console-only",
      locale: "en",
      locales: ["en"],
      fact_base: "fact-base/my-product-example-en",
    },
    null,
    2
  );
}

/**
 * Build a fixture config from a JSON file (used by --non-interactive init).
 * Returns `{ ...fixture, ...defaults }`; fixture wins.
 */
function fromFixture(fixturePath) {
  const raw = fs.readFileSync(fixturePath, "utf-8");
  return JSON.parse(raw);
}

module.exports = { load, validate, sample, fromFixture, REQUIRED };
