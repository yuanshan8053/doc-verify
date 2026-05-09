"use strict";

/**
 * JSON Schema validator. Uses ajv when available (recommended); falls back to
 * a minimal type-check if ajv is missing so the CLI never breaks on a fresh
 * clone without `npm install`.
 *
 * Schemas live under `<repo-root>/schemas/`. Each fact-base output file has a
 * matching schema named after `$schema` field.
 */

const fs = require("fs");
const path = require("path");

let _ajv = null;
function getAjv() {
  if (_ajv === null) {
    try {
      const Ajv = require("ajv");
      _ajv = new Ajv({ allErrors: true, strict: false });
      try {
        const addFormats = require("ajv-formats");
        addFormats(_ajv);
      } catch {
        // optional
      }
    } catch {
      _ajv = false; // mark as unavailable
    }
  }
  return _ajv || null;
}

function schemasDir() {
  // src/lib/schema.js → ../../schemas
  return path.resolve(__dirname, "..", "..", "schemas");
}

const SCHEMA_BY_KEY = {
  "ui-code-facts/v1": "ui-code-facts.v1.json",
  "audit-plan/v1": "audit-plan.v1.json",
  "exploration-report/v1": "exploration-report.v1.json",
  "flow-deviations/v1": "flow-deviations.v1.json",
};

/**
 * Determine which schema applies to a given JSON file. Reads `$schema` field;
 * also accepts `schema` or filename heuristics for backward compat.
 */
function resolveSchemaFor(fileAbs) {
  const raw = fs.readFileSync(fileAbs, "utf-8");
  const data = JSON.parse(raw);
  const key = data.$schema || data.schema || guessFromFilename(fileAbs);
  if (!key) return { data, schemaPath: null };
  const fname = SCHEMA_BY_KEY[key];
  if (!fname) return { data, schemaPath: null, schemaKey: key };
  const sp = path.join(schemasDir(), fname);
  return { data, schemaPath: fs.existsSync(sp) ? sp : null, schemaKey: key };
}

function guessFromFilename(fileAbs) {
  const base = path.basename(fileAbs);
  if (/^audit-plan\.json$/.test(base)) return "audit-plan/v1";
  if (/^exploration-report\.json$/.test(base)) return "exploration-report/v1";
  if (/^flow-deviations\.json$/.test(base)) return "flow-deviations/v1";
  if (/ui-(code|console|merged)-facts/.test(base)) return "ui-code-facts/v1";
  return null;
}

/**
 * Validate a JSON file against its declared schema.
 * Returns `{ ok, errors, schemaKey, ajvUsed }`.
 */
function validateFile(fileAbs) {
  const { data, schemaPath, schemaKey } = resolveSchemaFor(fileAbs);
  if (!schemaPath) {
    return { ok: false, errors: [{ msg: `No schema registered for "${schemaKey || "(none)"}"` }], schemaKey, ajvUsed: false };
  }
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
  const ajv = getAjv();
  if (ajv) {
    const validate = ajv.compile(schema);
    const ok = validate(data);
    return { ok, errors: validate.errors || [], schemaKey, ajvUsed: true };
  }
  // Fallback: shallow type check via $required at top level only.
  const errors = shallowCheck(schema, data);
  return { ok: errors.length === 0, errors, schemaKey, ajvUsed: false };
}

function shallowCheck(schema, data) {
  const errors = [];
  if (schema.type === "object" && (typeof data !== "object" || data === null || Array.isArray(data))) {
    errors.push({ msg: `expected object, got ${typeof data}` });
  }
  if (schema.required && Array.isArray(schema.required)) {
    for (const k of schema.required) {
      if (!(k in (data || {}))) errors.push({ msg: `missing required field: ${k}` });
    }
  }
  return errors;
}

function formatErrors(errors) {
  return errors
    .map((e) => {
      if (e.msg) return `  • ${e.msg}`;
      const loc = e.instancePath || "(root)";
      return `  • ${loc} ${e.message}${e.params ? " " + JSON.stringify(e.params) : ""}`;
    })
    .join("\n");
}

module.exports = { validateFile, formatErrors, schemasDir, SCHEMA_BY_KEY };
