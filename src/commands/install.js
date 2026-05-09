"use strict";

/**
 * `doc-verify install` — copy SKILL.md files into agent skill directories.
 *
 * Supports --agent (multi: comma-separated) and --skills-dir (override the
 * source). Idempotent: copying overwrites existing files (skills are
 * versioned via frontmatter `version:`).
 */

const fs = require("fs");
const path = require("path");
const { ask } = require("../lib/prompts");

const SKILLS = [
  "ui-code-fact-extractor",
  "doc-collection-planner",
  "console-explorer", // P0-A: new
  "console-fact-collector",
  "doc-fact-verifier",
  "doc-console-verifier",
];

const AGENT_DIRS = {
  "claude-code": ".claude/skills",
  trae: ".trae/skills",
  copilot: ".github/skills",
};

function getSkillsSourceDir(scriptDir, override) {
  if (override) {
    if (fs.existsSync(path.join(override, "console-fact-collector", "SKILL.md"))) return override;
    throw new Error(`--skills-dir does not contain expected skills: ${override}`);
  }
  const candidates = [
    path.join(scriptDir, "..", "..", "skills"), // src/commands → ../../skills
    path.join(scriptDir, "..", "skills"),
    path.join(scriptDir, "skills"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "console-fact-collector", "SKILL.md"))) return c;
  }
  const e = new Error("Cannot find skills directory");
  e.hint = "Pass --skills-dir <path>, or run from the doc-verify project root";
  throw e;
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

async function run(flags, log, cwd) {
  let agents;
  if (flags.agent) {
    agents = String(flags.agent)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (flags["non-interactive"]) {
    agents = ["claude-code"];
    log.info("Defaulting to claude-code (non-interactive mode)");
  } else {
    const ans = await ask("Which agents (comma-separated: claude-code,trae,copilot)", {
      default: "claude-code",
    });
    agents = ans.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (!agents.length) {
    log.warn("No agents selected, exiting");
    return;
  }

  const skillsDir = getSkillsSourceDir(__dirname, flags["skills-dir"]);
  let installed = 0;

  for (const agent of agents) {
    const targetRel = AGENT_DIRS[agent];
    if (!targetRel) {
      log.warn("Unknown agent, skipping", { agent });
      continue;
    }
    const targetDir = path.join(cwd, targetRel);
    mkdirp(targetDir);
    for (const skill of SKILLS) {
      const src = path.join(skillsDir, skill, "SKILL.md");
      if (!fs.existsSync(src)) {
        log.warn("Skill source missing", { skill });
        continue;
      }
      const dst = path.join(targetDir, skill);
      mkdirp(dst);
      fs.copyFileSync(src, path.join(dst, "SKILL.md"));
      installed++;
    }
    log.info("Installed", { agent, dir: targetRel, count: SKILLS.length });
  }

  // Write a manifest so users can audit which skill versions are installed.
  fs.writeFileSync(
    path.join(cwd, ".doc-verify-install.json"),
    JSON.stringify(
      {
        installed_at: new Date().toISOString(),
        agents,
        skills: SKILLS,
        source: skillsDir,
      },
      null,
      2
    ) + "\n"
  );

  log.info("Total skill files installed", { count: installed });
}

module.exports = { run, SKILLS, AGENT_DIRS };
