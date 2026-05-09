"use strict";

/**
 * Thin wrapper around `npx @playwright/cli` so we never repeat the binary
 * incantation in 5 different files.
 *
 * Versioning: pinned to ^0.1 to avoid breaking changes from `latest`. The pin
 * lives here only; Skill prompts can reference `bin()` indirectly via the
 * paths.json manifest written by `init`.
 *
 * Polling > sleeping: replaces the original `execSync("sleep 2")` calls.
 */

const { spawn, execSync } = require("child_process");

const PIN = process.env.DOC_VERIFY_PW_PIN || "^0.1";

function bin() {
  return `npx @playwright/cli@${PIN}`;
}

/**
 * Run a Playwright CLI subcommand and return stdout.
 * Throws with a structured error on non-zero exit.
 */
function run(args, opts = {}) {
  const cmd = `${bin()} ${args}`;
  try {
    const out = execSync(cmd, {
      encoding: "utf-8",
      cwd: opts.cwd || process.cwd(),
      timeout: opts.timeout || 30000,
      stdio: opts.stdio || ["pipe", "pipe", "pipe"],
    });
    return out;
  } catch (err) {
    const wrapped = new Error(`playwright-cli failed: ${args}`);
    wrapped.cause = err;
    wrapped.stdout = err.stdout && err.stdout.toString();
    wrapped.stderr = err.stderr && err.stderr.toString();
    wrapped.code = err.status;
    throw wrapped;
  }
}

/**
 * Background-launch the browser. The CLI's `open` exits immediately after
 * spawning the browser, so we use spawn with `detached` semantics.
 */
function open(opts = {}) {
  const child = spawn(
    "npx",
    [`@playwright/cli@${PIN}`, "open", "--browser", "chromium", `--config=${opts.configFile || ".playwright/cli.config.json"}`],
    {
      cwd: opts.cwd || process.cwd(),
      stdio: opts.stdio || "pipe",
    }
  );
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout && child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr && child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || code === null) resolve({ stdout, stderr });
      else reject(Object.assign(new Error(`open exited ${code}`), { stdout, stderr, code }));
    });
  });
}

/** Poll predicate until truthy or timeout. */
async function poll(fn, { timeout = 15000, interval = 250, label = "" } = {}) {
  const start = Date.now();
  let lastErr;
  while (Date.now() - start < timeout) {
    try {
      const r = await fn();
      if (r) return r;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  const err = new Error(`Timed out after ${timeout}ms${label ? ` waiting for ${label}` : ""}`);
  if (lastErr) err.cause = lastErr;
  throw err;
}

/** Wait for a browser session to be `open`. */
async function waitOpen(opts = {}) {
  return poll(
    () => {
      try {
        const out = execSync(`${bin()} list --json`, {
          cwd: opts.cwd || process.cwd(),
          encoding: "utf-8",
          timeout: 5000,
          stdio: ["pipe", "pipe", "pipe"],
        });
        const parsed = safeParse(out);
        const open = Array.isArray(parsed)
          ? parsed.some((s) => (s.status || "").toLowerCase() === "open")
          : /\bopen\b/.test(out);
        return open;
      } catch {
        return false;
      }
    },
    { timeout: opts.timeout || 15000, interval: 300, label: "browser to be open" }
  );
}

/** Wait for the page to reach readyState=complete. */
async function waitReady(opts = {}) {
  return poll(
    () => {
      try {
        const out = run(`eval "document.readyState"`, { cwd: opts.cwd, timeout: 5000 });
        return /complete/.test(out);
      } catch {
        return false;
      }
    },
    { timeout: opts.timeout || 20000, interval: 300, label: "page readyState=complete" }
  );
}

/**
 * Structured login probe. Returns `{ url, hasPwd, redirectedToLogin }`.
 * Replaces the brittle `snapshot.includes("log in")` check.
 */
function probeLogin(cwd) {
  const expr = `JSON.stringify({url: location.href, hasPwd: !!document.querySelector('input[type=password]'), title: document.title})`;
  const out = run(`eval "${expr.replace(/"/g, '\\"')}"`, { cwd, timeout: 8000 });
  const json = safeParse(out) || {};
  const url = json.url || "";
  const hasPwd = !!json.hasPwd;
  const redirectedToLogin = /\/login|\/sso|\/sign[-_]?in/i.test(url);
  return { url, hasPwd, redirectedToLogin, needsLogin: hasPwd || redirectedToLogin };
}

function safeParse(s) {
  if (!s) return null;
  try {
    return JSON.parse(s.trim());
  } catch {
    // The CLI sometimes wraps result in quotes — strip & retry.
    const stripped = s.trim().replace(/^['"]/, "").replace(/['"]$/, "");
    try {
      return JSON.parse(stripped);
    } catch {
      return null;
    }
  }
}

function goto(url, opts = {}) {
  return run(`goto "${url}"`, opts);
}

function snapshot(opts = {}) {
  return run(`snapshot --raw`, { ...opts, timeout: opts.timeout || 15000 });
}

function stateLoad(file, opts = {}) {
  return run(`state-load "${file}"`, opts);
}

function stateSave(file, opts = {}) {
  return run(`state-save "${file}"`, opts);
}

function closeAll(opts = {}) {
  try {
    return run(`close-all`, { ...opts, timeout: 5000 });
  } catch {
    return null;
  }
}

function version(opts = {}) {
  try {
    return run(`--version`, { ...opts, timeout: 5000 }).trim();
  } catch (e) {
    return null;
  }
}

module.exports = {
  bin,
  run,
  open,
  waitOpen,
  waitReady,
  goto,
  snapshot,
  stateLoad,
  stateSave,
  closeAll,
  probeLogin,
  poll,
  version,
  PIN,
};
