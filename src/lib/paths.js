"use strict";

/**
 * Centralised path computation for fact-base layout.
 *
 * Why this exists:
 *   - Original code spread `fact-base/{product}-{console}-{locale}/...` across
 *     the CLI and 5 SKILL.md files. Any change required 5 sync edits.
 *   - This module is the single source of truth and is also dumped to
 *     `paths.json` at init-time so Skills can read paths without re-deriving
 *     them.
 */

const path = require("path");

/**
 * Build a paths object rooted at a project directory + factBase.
 * Pass-through stable string values; skill prompts can reference them directly.
 *
 * @param {string} projectDir Absolute path to the project root.
 * @param {string} factBase Relative fact-base path, e.g. "fact-base/iga-byteplus-en".
 */
function build(projectDir, factBase) {
  const fb = path.posix.join(factBase); // posix to keep skill prompts stable

  const rel = {
    factBase: fb,
    meta: `${fb}/meta.json`,
    auth: `${fb}/auth-state.json`,
    sourceFacts: `${fb}/source-facts`,
    consoleFacts: `${fb}/console-facts`,
    consolePages: `${fb}/console-facts/pages`,
    navigationTree: `${fb}/console-facts/navigation-tree.json`,
    uiConsoleFacts: `${fb}/console-facts/ui-console-facts.json`,
    explorationReport: `${fb}/console-facts/exploration-report.json`,
    flowDeviations: `${fb}/console-facts/flow-deviations.json`,
    screenshots: `${fb}/console-facts/screenshots`,
    mergedFacts: `${fb}/merged-facts`,
    sourceVsConsoleDiff: `${fb}/merged-facts/source-vs-console-diff.json`,
    uiMergedFacts: `${fb}/merged-facts/ui-merged-facts.json`,
    auditPlan: `${fb}/audit-plan.json`,
    reports: `${fb}/reports`,
    changeLog: `${fb}/change-log.json`,
    config: "config/project.json",
    pwConfig: ".playwright/cli.config.json",
    pathsManifest: "paths.json",
  };

  const abs = {};
  for (const [k, v] of Object.entries(rel)) {
    abs[k] = path.join(projectDir, v);
  }

  return {
    rel,
    abs,
    sourceFact: (page) => `${rel.sourceFacts}/${page}.json`,
    consolePage: (page) => `${rel.consolePages}/${page}.json`,
    report: (doc) => `${rel.reports}/${doc}-diff-report.md`,
    screenshot: (name) => `${rel.screenshots}/${name}.png`,
  };
}

/**
 * Derive a stable short slug for the console host. Robust against TLD variants
 * and the `console.` subdomain.
 */
function consoleSlug(consoleUrl) {
  if (!consoleUrl) return "unknown";
  let host;
  try {
    host = new URL(consoleUrl).hostname;
  } catch {
    return "unknown";
  }
  // Strip leading `console.` if present.
  host = host.replace(/^console\./, "");
  // Take the first label (everything before the first dot remaining).
  const first = host.split(".")[0];
  return first || "unknown";
}

module.exports = { build, consoleSlug };
