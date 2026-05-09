#!/usr/bin/env node
"use strict";

/**
 * doc-verify CLI — thin router.
 *
 * Implementation lives in src/commands/*.js (one file per subcommand).
 * Shared utilities live in src/lib/*.
 */

const path = require("path");
const args = require(path.join(__dirname, "..", "src", "lib", "args"));
const logger = require(path.join(__dirname, "..", "src", "lib", "log"));

const COMMANDS = {
  init: () => require("../src/commands/init"),
  install: () => require("../src/commands/install"),
  login: () => require("../src/commands/login"),
  "login-save": () => require("../src/commands/login-save"),
  console: () => require("../src/commands/console"),
  validate: () => require("../src/commands/validate"),
  doctor: () => require("../src/commands/doctor"),
};

const BOOLEANS = ["non-interactive", "force", "json", "wait-and-save", "help"];

function help() {
  return `
doc-verify — Technical documentation verification toolkit

Usage:
  doc-verify <command> [flags]

Commands:
  init                   Create a new verification project
  install                Install skills to AI agent directories
  login                  Open browser for manual login (saves auth state)
  login-save             Save auth state from currently open browser
  console                Open browser with saved auth state, navigate to console
  validate <file...>     Schema-check fact-base output JSON files
  doctor                 Preflight environment + config check

Flags:
  --non-interactive      Run without prompts (init/install)
  --config <path>        Path to config/project.json (default: ./config/project.json)
                         For init --non-interactive: a fixture JSON of project fields
  --out <dir>            Output directory for init (default: ./<project>)
  --agent <name[,name]>  Agents to install skills for: claude-code,trae,copilot
  --skills-dir <path>    Override skills source (advanced)
  --force                Overwrite existing project (init)
  --json                 Emit structured JSON logs (one record per line)
  --wait-and-save        login: wait for ENTER then auto save state

Environment:
  DOC_VERIFY_CONFIG      Default --config path
  DOC_VERIFY_PW_PIN      Override Playwright CLI version pin (default: ^0.1)
  DOC_VERIFY_DEBUG       Enable debug logs

Examples:
  doc-verify init
  doc-verify init --non-interactive --config fixtures/iga.json --out ./iga-docs
  doc-verify install --agent claude-code,trae
  doc-verify login
  doc-verify console
  doc-verify validate fact-base/iga-byteplus-en/audit-plan.json
  doc-verify doctor
`.trim();
}

async function main() {
  const argv = process.argv.slice(2);
  const flags = args.parse(argv, { booleans: BOOLEANS });
  const log = logger.create({ json: !!flags.json });
  const command = flags._[0];
  const cwd = process.cwd();

  if (!command || flags.help || command === "help") {
    process.stdout.write(help() + "\n");
    return;
  }

  const loader = COMMANDS[command];
  if (!loader) {
    log.error("Unknown command", { command });
    process.stdout.write("\n" + help() + "\n");
    process.exitCode = 64; // EX_USAGE
    return;
  }

  let mod;
  try {
    mod = loader();
  } catch (e) {
    log.fatal("Cannot load command module", { command, error: e.message });
    process.exitCode = 70;
    return;
  }

  try {
    await mod.run(flags, log, cwd);
  } catch (e) {
    log.error(e.message || String(e), e.hint ? { hint: e.hint } : undefined);
    if (process.env.DOC_VERIFY_DEBUG && e.stack) {
      process.stderr.write(e.stack + "\n");
    }
    process.exitCode = process.exitCode || 1;
  }
}

main().catch((e) => {
  // Last-resort handler — should never reach here.
  process.stderr.write(`fatal: ${e.message || e}\n`);
  process.exit(70);
});
