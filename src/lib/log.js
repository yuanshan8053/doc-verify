"use strict";

/**
 * Structured logger + step runner.
 *
 * Why this exists:
 *   - Original CLI swallowed errors with `// ignore`, masking failures from
 *     both users and downstream Agents.
 *   - Agents need machine-readable output. `--json` mode prints one
 *     newline-delimited JSON object per log line.
 *
 * Usage:
 *   const log = require("./log").create({ json: !!flags.json });
 *   await log.runStep("open-browser", () => playwrightOpen());
 */

const FATAL = "fatal";
const ERROR = "error";
const WARN = "warn";
const INFO = "info";
const DEBUG = "debug";

const COLORS = {
  fatal: "\x1b[41m\x1b[37m", // white on red
  error: "\x1b[31m",
  warn: "\x1b[33m",
  info: "\x1b[36m",
  debug: "\x1b[90m",
  reset: "\x1b[0m",
};

const ICONS = {
  fatal: "💥",
  error: "❌",
  warn: "⚠️ ",
  info: "ℹ️ ",
  debug: "·",
  step: "▶",
  ok: "✅",
};

function create(opts = {}) {
  const json = !!opts.json;
  const tty = process.stdout.isTTY && !json;

  function emit(level, msg, fields) {
    const ts = new Date().toISOString();
    if (json) {
      const record = { ts, level, msg, ...(fields || {}) };
      process.stdout.write(JSON.stringify(record) + "\n");
      return;
    }
    const color = tty ? COLORS[level] || "" : "";
    const reset = tty ? COLORS.reset : "";
    const icon = ICONS[level] || "";
    let line = `${color}${icon} ${msg}${reset}`;
    if (fields && Object.keys(fields).length) {
      const tail = Object.entries(fields)
        .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join(" ");
      line += ` ${tail}`;
    }
    const stream = level === ERROR || level === FATAL ? process.stderr : process.stdout;
    stream.write(line + "\n");
  }

  function step(name) {
    if (json) {
      emit(INFO, "step.begin", { step: name });
    } else if (tty) {
      process.stdout.write(`${COLORS.info}${ICONS.step} ${name}…${COLORS.reset}`);
    } else {
      process.stdout.write(`${ICONS.step} ${name}…`);
    }
  }

  function stepOk(name, fields) {
    if (json) {
      emit(INFO, "step.ok", { step: name, ...(fields || {}) });
    } else {
      const reset = tty ? COLORS.reset : "";
      process.stdout.write(`\r${ICONS.ok} ${name}${reset}\n`);
    }
  }

  function stepFail(name, err, hint) {
    if (json) {
      emit(ERROR, "step.fail", {
        step: name,
        error: err && err.message ? err.message : String(err),
        hint: hint || null,
      });
    } else {
      const reset = tty ? COLORS.reset : "";
      const color = tty ? COLORS.error : "";
      process.stdout.write(`\r${color}${ICONS.error} ${name}${reset}\n`);
      const msg = err && err.message ? err.message : String(err);
      process.stderr.write(`    reason: ${msg}\n`);
      if (hint) process.stderr.write(`    hint:   ${hint}\n`);
    }
  }

  /**
   * runStep — wrap an async step so that:
   *   1. progress is visible (even on TTY pipes / CI),
   *   2. failures are reported with a `hint` for self-recovery,
   *   3. the original error is rethrown unless `swallow: true`.
   *
   * @param {string} name
   * @param {() => Promise<any>} fn
   * @param {{ hint?: string, swallow?: boolean, fatal?: boolean }} [opts]
   */
  async function runStep(name, fn, opts) {
    const o = opts || {};
    step(name);
    try {
      const out = await fn();
      stepOk(name, typeof out === "object" && out !== null && !Array.isArray(out) ? out : undefined);
      return out;
    } catch (err) {
      stepFail(name, err, o.hint);
      if (o.fatal) {
        process.exit(2);
      }
      if (o.swallow) {
        return undefined;
      }
      throw err;
    }
  }

  return {
    fatal: (msg, fields) => emit(FATAL, msg, fields),
    error: (msg, fields) => emit(ERROR, msg, fields),
    warn: (msg, fields) => emit(WARN, msg, fields),
    info: (msg, fields) => emit(INFO, msg, fields),
    debug: (msg, fields) => process.env.DOC_VERIFY_DEBUG && emit(DEBUG, msg, fields),
    runStep,
    step,
    stepOk,
    stepFail,
  };
}

module.exports = { create };
