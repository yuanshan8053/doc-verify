"use strict";

/**
 * `doc-verify login-save` — save auth state from currently open browser.
 */

const fs = require("fs");
const path = require("path");
const pw = require("../lib/playwright-cli");
const { load } = require("../lib/config");

async function run(flags, log, cwd) {
  const { cfg } = load(cwd, flags.config);
  const authPath = path.join(cwd, cfg.fact_base, "auth-state.json");
  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  await log.runStep(`save auth state → ${path.relative(cwd, authPath)}`, () => {
    pw.stateSave(authPath, { cwd });
  }, { hint: "Make sure the browser is still open. If not, run `doc-verify login` again." });
}

module.exports = { run };
