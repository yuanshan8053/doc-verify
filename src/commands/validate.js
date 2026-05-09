"use strict";

/**
 * `doc-verify validate <file...>` — schema-check fact-base outputs.
 *
 * Picks schema by `$schema` field or filename heuristic. Exits non-zero on
 * any failure so CI / Skill self-checks can rely on it.
 */

const path = require("path");
const fs = require("fs");
const { validateFile, formatErrors } = require("../lib/schema");

async function run(flags, log, cwd) {
  const targets = flags._.slice(1); // drop the subcommand
  if (!targets.length) {
    throw Object.assign(new Error("Usage: doc-verify validate <file.json> [<file.json> ...]"), {
      hint: "Pass one or more JSON files to validate.",
    });
  }
  let failed = 0;
  for (const t of targets) {
    const abs = path.isAbsolute(t) ? t : path.join(cwd, t);
    if (!fs.existsSync(abs)) {
      log.error("Not found", { file: t });
      failed++;
      continue;
    }
    let result;
    try {
      result = validateFile(abs);
    } catch (e) {
      log.error("Cannot read/parse JSON", { file: t, error: e.message });
      failed++;
      continue;
    }
    if (result.ok) {
      log.info("✓ valid", { file: t, schema: result.schemaKey, ajv: result.ajvUsed });
    } else {
      failed++;
      log.error("✗ invalid", { file: t, schema: result.schemaKey || "(none)", ajv: result.ajvUsed });
      const out = formatErrors(result.errors);
      process.stderr.write(out + "\n");
    }
  }
  if (failed) {
    process.exitCode = 1;
    log.warn(`${failed} file(s) failed validation`);
  }
}

module.exports = { run };
