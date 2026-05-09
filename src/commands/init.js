"use strict";

/**
 * `doc-verify init` — create a verification project.
 *
 * Modes:
 *   Interactive (default): prompts for required fields with defaults.
 *   Non-interactive: --non-interactive --config <fixture.json> [--out <dir>].
 *
 * Idempotent: re-running on an existing project warns and refuses to
 * overwrite without --force.
 */

const fs = require("fs");
const path = require("path");
const { ask } = require("../lib/prompts");
const { build, consoleSlug } = require("../lib/paths");
const { fromFixture, validate } = require("../lib/config");

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
}

async function run(flags, log, cwd) {
  const nonInteractive = !!flags["non-interactive"];
  let cfg;
  let outDir;

  if (nonInteractive) {
    if (!flags.config) {
      throw Object.assign(new Error("--non-interactive requires --config <fixture.json>"), {
        hint: "Pass a JSON file containing project, console_url, locale, locales, and optional source_code_path / docs_path",
      });
    }
    const fixturePath = path.resolve(cwd, flags.config);
    cfg = fromFixture(fixturePath);
    outDir = flags.out ? path.resolve(cwd, flags.out) : path.join(cwd, cfg.project);
  } else {
    log.info("doc-verify init — Create a documentation verification project");
    const projectName = await ask("Project name", { default: "my-product-docs", required: true });
    const consoleUrl = await ask("Console URL", {
      required: true,
      validate: (v) => {
        try {
          new URL(v);
          return true;
        } catch {
          return "Must be a valid URL (https://...)";
        }
      },
    });
    const sourceCodePath = (await ask("Source code path (optional)", { default: "" })) || null;
    const docsPath = (await ask("Documentation path (optional)", { default: "" })) || null;
    const locale = await ask("Primary locale", { default: "en", required: true });
    const localesExtra = await ask("Additional locales, comma-separated (or blank)", { default: "" });
    const locales = localesExtra
      ? [locale, ...localesExtra.split(",").map((s) => s.trim()).filter(Boolean)]
      : [locale];

    cfg = {
      project: projectName,
      console_url: consoleUrl,
      source_code_path: sourceCodePath,
      docs_path: docsPath,
      mode: sourceCodePath ? "source-enhanced" : "console-only",
      locale,
      locales,
    };
    outDir = path.join(cwd, projectName);
  }

  // Derive defaults that may be missing.
  if (!cfg.mode) cfg.mode = cfg.source_code_path ? "source-enhanced" : "console-only";
  if (!cfg.locale) cfg.locale = "en";
  if (!cfg.locales) cfg.locales = [cfg.locale];
  if (!cfg.fact_base) {
    const slug = consoleSlug(cfg.console_url);
    cfg.fact_base = `fact-base/${cfg.project}-${slug}-${cfg.locale}`;
  }

  validate(cfg, "<init>");

  if (fs.existsSync(outDir) && !flags.force) {
    if (fs.existsSync(path.join(outDir, "config", "project.json"))) {
      throw Object.assign(new Error(`Project already exists at ${outDir}`), {
        hint: "Pass --force to overwrite, or pick a different --out path",
      });
    }
  }

  mkdirp(outDir);
  const paths = build(outDir, cfg.fact_base);

  // fact-base structure
  mkdirp(paths.abs.sourceFacts);
  mkdirp(paths.abs.consolePages);
  mkdirp(paths.abs.screenshots);
  mkdirp(paths.abs.mergedFacts);
  mkdirp(paths.abs.reports);
  mkdirp(path.join(outDir, "config"));
  mkdirp(path.join(outDir, "skills"));
  mkdirp(path.join(outDir, ".playwright"));

  writeJSON(path.join(outDir, "config", "project.json"), cfg);

  writeJSON(paths.abs.meta, {
    product: cfg.project,
    console: consoleSlug(cfg.console_url),
    console_url: cfg.console_url,
    locale: cfg.locale,
    locales: cfg.locales,
    source_code_path: cfg.source_code_path,
    docs_path: cfg.docs_path,
    mode: cfg.mode,
    created_at: new Date().toISOString().split("T")[0],
    pages_verified: [],
  });

  // P4: dropping userDataDir; rely solely on state-save/state-load.
  // This avoids the "two truths" problem (profile cookies vs auth-state.json).
  writeJSON(path.join(outDir, ".playwright", "cli.config.json"), {
    browser: {
      browserName: "chromium",
      isolated: false,
      // userDataDir intentionally omitted — see commands/login.js
      launchOptions: {
        headless: false,
        args: ["--no-sandbox", "--disable-gpu-sandbox", "--disable-dev-shm-usage"],
      },
    },
    outputDir: paths.rel.consoleFacts,
  });

  // Write paths.json so Skills can resolve standard paths without re-deriving.
  writeJSON(path.join(outDir, paths.rel.pathsManifest), {
    "$schema": "doc-verify-paths/v1",
    fact_base: cfg.fact_base,
    paths: paths.rel,
  });

  log.info("Project created", { outDir, mode: cfg.mode, locales: cfg.locales.join(",") });
  log.info("Next steps:");
  log.info(`  1) cd ${path.relative(cwd, outDir) || "."}`);
  log.info("  2) doc-verify install --agent claude-code");
  log.info("  3) doc-verify login");
  log.info('  4) Open in your AI agent: "Verify my documentation"');
}

module.exports = { run };
