"use strict";

/**
 * `doc-verify console` — open browser, load auth state, navigate to the
 * console, structurally verify login.
 *
 * P4 changes:
 *   - Uses structured probe (URL + password input) instead of keyword search.
 *   - Uses readyState polling instead of `sleep`.
 *   - Auth-state.json is the single source of login truth.
 */

const fs = require("fs");
const path = require("path");
const pw = require("../lib/playwright-cli");
const { load } = require("../lib/config");

async function run(flags, log, cwd) {
  const { cfg } = load(cwd, flags.config);
  const authPath = path.join(cwd, cfg.fact_base, "auth-state.json");
  const hasAuth = fs.existsSync(authPath);

  // Step 1: open or reuse browser.
  let alreadyOpen = false;
  try {
    await pw.waitOpen({ cwd, timeout: 1500 });
    alreadyOpen = true;
  } catch {
    /* not open */
  }

  if (!alreadyOpen) {
    await log.runStep("launch browser", async () => {
      await pw.open({ cwd, stdio: "ignore" });
      await pw.waitOpen({ cwd, timeout: 20000 });
    }, { hint: "If repeatedly times out, check .playwright/cli.config.json args" });
  } else {
    log.info("Reusing existing browser session");
  }

  // Step 2: load auth state.
  if (hasAuth) {
    await log.runStep("load auth state", () => pw.stateLoad(authPath, { cwd }), {
      swallow: true,
      hint: "Auth file exists but state-load failed. The file may be from a different browser version.",
    });
  } else {
    log.warn("No auth state found", { hint: "Run `doc-verify login` first" });
  }

  // Step 3: navigate (this triggers cookies to take effect).
  await log.runStep(`goto ${cfg.console_url}`, async () => {
    pw.goto(cfg.console_url, { cwd, timeout: 30000 });
    await pw.waitReady({ cwd, timeout: 20000 });
  });

  // Step 4: structured login probe (P4: replaces snapshot.includes).
  let probe = null;
  await log.runStep("verify login state", async () => {
    probe = pw.probeLogin(cwd);
    if (probe.needsLogin) {
      throw Object.assign(new Error("Login required"), {
        needsLogin: true,
        url: probe.url,
      });
    }
  }, {
    swallow: true,
    hint: "Browser is at a login form. Log in manually, then run `doc-verify login-save`.",
  });

  if (probe && !probe.needsLogin) {
    log.info("Logged in", { url: probe.url });
  }

  log.info("Browser ready. Useful commands:");
  log.info(`  ${pw.bin()} snapshot   # Get page structure`);
  log.info(`  ${pw.bin()} screenshot # Capture image`);
  log.info(`  ${pw.bin()} eval <js>  # Run JavaScript`);
}

module.exports = { run };
