"use strict";

/**
 * `doc-verify login` — open browser for manual login, then save state.
 *
 * P4 changes vs v0.1:
 *   - No longer relies on `userDataDir` profile cookies (the "two truths"
 *     problem). Auth lives only in `auth-state.json`.
 *   - Login detection uses a structured probe (URL + DOM password input),
 *     not a keyword search of the snapshot text.
 *   - `sleep N` replaced by readyState polling.
 */

const fs = require("fs");
const path = require("path");
const pw = require("../lib/playwright-cli");
const { load } = require("../lib/config");

async function run(flags, log, cwd) {
  const { cfg } = load(cwd, flags.config);
  const authPath = path.join(cwd, cfg.fact_base, "auth-state.json");
  fs.mkdirSync(path.dirname(authPath), { recursive: true });

  log.info("Opening browser", { url: cfg.console_url });
  log.info("After you've logged in, save state with: doc-verify login-save");

  await log.runStep("launch browser", async () => {
    await pw.open({ cwd, stdio: "ignore" });
    await pw.waitOpen({ cwd, timeout: 20000 });
  }, { hint: "If launch keeps timing out, check .playwright/cli.config.json launchOptions.args contains --no-sandbox" });

  await log.runStep("navigate to console", async () => {
    pw.goto(cfg.console_url, { cwd, timeout: 30000 });
    await pw.waitReady({ cwd });
  });

  if (flags["wait-and-save"]) {
    log.info("Press ENTER in this terminal once you've finished logging in.");
    await new Promise((r) => process.stdin.once("data", r));
    await saveState(cwd, authPath, log);
  } else {
    log.info("Browser is open. Once logged in, run: doc-verify login-save");
  }
}

async function saveState(cwd, authPath, log) {
  await log.runStep(`save auth state → ${path.relative(cwd, authPath)}`, () => {
    pw.stateSave(authPath, { cwd });
  });
}

module.exports = { run, saveState };
