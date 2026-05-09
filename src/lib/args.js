"use strict";

/**
 * Minimal flag parser — kept dependency-free.
 *
 * Supports:
 *   - `--key value`  → flags.key = "value"
 *   - `--key=value`  → flags.key = "value"
 *   - `--flag`        → flags.flag = true
 *   - `--no-flag`     → flags.flag = false
 *   - positional args → returned as `_`
 *
 * Boolean flags are inferred when the next token starts with `--`, exists at
 * end-of-args, or matches a registered booleans list.
 */

function parse(argv, opts = {}) {
  const booleans = new Set(opts.booleans || []);
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (tok.startsWith("--no-")) {
      flags[tok.slice(5)] = false;
      continue;
    }
    if (tok.startsWith("--")) {
      const eq = tok.indexOf("=");
      if (eq !== -1) {
        flags[tok.slice(2, eq)] = tok.slice(eq + 1);
        continue;
      }
      const name = tok.slice(2);
      const next = argv[i + 1];
      if (booleans.has(name) || next === undefined || next.startsWith("--")) {
        flags[name] = true;
      } else {
        flags[name] = next;
        i++;
      }
      continue;
    }
    positional.push(tok);
  }
  flags._ = positional;
  return flags;
}

module.exports = { parse };
