#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execSync } = require("child_process");

const SKILLS = [
  "ui-code-fact-extractor",
  "doc-collection-planner",
  "console-fact-collector",
  "doc-fact-verifier",
  "doc-console-verifier",
];

const AGENT_DIRS = {
  "claude-code": ".claude/skills",
  trae: ".trae/skills",
  copilot: ".github/skills",
};

const CWD = process.cwd();

function rl(question) {
  const iface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    iface.question(question, (answer) => {
      iface.close();
      resolve(answer.trim());
    });
  });
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function getSkillsSourceDir() {
  const scriptDir = path.dirname(fs.realpathSync(__filename));
  const candidates = [
    path.join(scriptDir, "..", "skills"),
    path.join(scriptDir, "skills"),
    path.join(scriptDir, "..", "doc-verify", "skills"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "ui-code-fact-extractor", "SKILL.md"))) {
      return c;
    }
  }
  console.error(
    "Error: Cannot find skills directory. Run this from the doc-verify project root."
  );
  process.exit(1);
}

async function cmdInit() {
  console.log("\n🚀 doc-verify init — Create a document verification project\n");

  const projectName =
    (await rl("Project name (e.g. my-product-docs): ")) || "my-product-docs";
  const consoleUrl = await rl("Console URL (e.g. https://console.example.com): ");
  const sourceCodePath =
    (await rl("Source code path (optional, press Enter to skip): ")) || null;
  const locale = (await rl("Primary locale (default: en): ")) || "en";
  const localesExtra = await rl(
    "Additional locales, comma-separated (e.g. zh,ja — press Enter for none): "
  );
  const locales = localesExtra
    ? [locale, ...localesExtra.split(",").map((s) => s.trim())]
    : [locale];

  const mode = sourceCodePath ? "source-enhanced" : "console-only";

  const projectDir = path.join(CWD, projectName);
  mkdirp(projectDir);

  // Derive fact_base path from product-console-locale convention
  const consoleHost = consoleUrl
    ? new URL(consoleUrl).hostname.replace("console.", "").replace(".com", "")
    : "unknown";
  const factBaseName = `${projectName}-${consoleHost}-${locale}`;
  const factBaseDir = path.join("fact-base", factBaseName);

  mkdirp(path.join(projectDir, factBaseDir, "source-facts"));
  mkdirp(path.join(projectDir, factBaseDir, "console-facts", "screenshots"));
  mkdirp(path.join(projectDir, factBaseDir, "merged-facts"));
  mkdirp(path.join(projectDir, factBaseDir, "reports"));
  mkdirp(path.join(projectDir, "config"));
  mkdirp(path.join(projectDir, "skills"));

  const projectConfig = {
    project: projectName,
    console_url: consoleUrl,
    source_code_path: sourceCodePath,
    docs_path: null,
    mode,
    locale,
    locales,
    fact_base: factBaseDir,
  };
  fs.writeFileSync(
    path.join(projectDir, "config", "project.json"),
    JSON.stringify(projectConfig, null, 2) + "\n"
  );

  // Write meta.json for the fact-base
  const metaConfig = {
    product: projectName,
    console: consoleHost,
    console_url: consoleUrl,
    locale,
    locales,
    source_code_path: sourceCodePath,
    docs_path: null,
    mode,
    created_at: new Date().toISOString().split("T")[0],
    pages_verified: [],
  };
  fs.writeFileSync(
    path.join(projectDir, factBaseDir, "meta.json"),
    JSON.stringify(metaConfig, null, 2) + "\n"
  );

  const playwrightConfig = {
    browser: {
      browserName: "chromium",
      isolated: false,
      userDataDir: path.join(projectDir, ".playwright", "profile"),
      launchOptions: {
        headless: false,
        args: ["--no-sandbox", "--disable-gpu-sandbox", "--disable-dev-shm-usage"],
      },
    },
    outputDir: path.join(projectDir, factBaseDir, "console-facts"),
  };
  mkdirp(path.join(projectDir, ".playwright"));
  fs.writeFileSync(
    path.join(projectDir, ".playwright", "cli.config.json"),
    JSON.stringify(playwrightConfig, null, 2) + "\n"
  );

  console.log(`\n✅ Project created at: ${projectDir}`);
  console.log(`   Mode: ${mode}`);
  console.log(`   Locales: ${locales.join(", ")}`);
  console.log(`\nNext steps:`);
  console.log(`  1. cd ${projectName}`);
  console.log(`  2. npx doc-verify install --skills`);
  console.log(`  3. npx doc-verify login`);
  console.log(
    `  4. Open this directory in your AI agent and say: "Verify my documentation"\n`
  );
}

async function cmdInstall() {
  console.log("\n📦 doc-verify install — Install skills to agent directories\n");

  const agentsInput = await rl(
    "Which agents? (comma-separated: claude-code,trae,copilot): "
  );
  const agents = agentsInput
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (agents.length === 0) {
    console.log("No agents selected. Exiting.");
    return;
  }

  const skillsDir = getSkillsSourceDir();
  let installed = 0;

  for (const agent of agents) {
    const targetDir = AGENT_DIRS[agent];
    if (!targetDir) {
      console.log(`  ⚠️ Unknown agent: ${agent}`);
      continue;
    }

    const fullTargetDir = path.join(CWD, targetDir);
    mkdirp(fullTargetDir);

    for (const skill of SKILLS) {
      const srcFile = path.join(skillsDir, skill, "SKILL.md");
      if (!fs.existsSync(srcFile)) {
        console.log(`  ⚠️ Skill not found: ${skill}`);
        continue;
      }

      const destDir = path.join(fullTargetDir, skill);
      mkdirp(destDir);
      fs.copyFileSync(srcFile, path.join(destDir, "SKILL.md"));
      installed++;
    }

    console.log(`  ✅ Installed ${SKILLS.length} skills to ${targetDir}/`);
  }

  console.log(`\n✅ Total: ${installed} skill files installed`);
  console.log(
    `\nSkills are now discoverable by your AI agent. Open this directory and say:`
  );
  console.log(`  "Extract UI facts from the source code"`);
  console.log(`  "Verify my documentation against the console"\n`);
}

async function cmdLogin() {
  console.log("\n🔐 doc-verify login — Save console auth state\n");

  const configPath = path.join(CWD, "config", "project.json");
  if (!fs.existsSync(configPath)) {
    console.error(
      "Error: config/project.json not found. Run 'doc-verify init' first."
    );
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const consoleUrl = config.console_url;
  const factBase = config.fact_base || "fact-base/unknown-en";

  console.log(`Opening browser to: ${consoleUrl}`);
  console.log(`Please log in manually, then press Ctrl+C when done.\n`);

  try {
    execSync(
      `npx @playwright/cli@latest open --browser chromium --config=.playwright/cli.config.json`,
      { stdio: "inherit", cwd: CWD }
    );
  } catch (e) {
    // User pressed Ctrl+C after login
  }

  const authPath = path.join(CWD, factBase, "auth-state.json");
  try {
    execSync(
      `npx @playwright/cli@latest state-save "${authPath}"`,
      { stdio: "inherit", cwd: CWD }
    );
    console.log(`\n✅ Auth state saved to: ${authPath}`);
  } catch (e) {
    console.log(
      `\n⚠️ Could not save auth state. Try manually: npx @playwright/cli@latest state-save "${authPath}"`
    );
  }

  try {
    execSync(`npx @playwright/cli@latest close-all`, {
      stdio: "inherit",
      cwd: CWD,
    });
  } catch (e) {
    // ignore
  }
}

async function cmdConsole() {
  console.log("\n🌐 doc-verify console — Open browser with auth state\n");

  const configPath = path.join(CWD, "config", "project.json");
  if (!fs.existsSync(configPath)) {
    console.error("Error: config/project.json not found. Run 'doc-verify init' first.");
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const consoleUrl = config.console_url;
  const factBase = config.fact_base || "fact-base/unknown-en";
  const authPath = path.join(CWD, factBase, "auth-state.json");
  const hasAuth = fs.existsSync(authPath);

  const cli = "npx @playwright/cli@latest";

  // Step 1: Check if browser already open
  let browserOpen = false;
  try {
    const listOutput = execSync(`${cli} list --json 2>/dev/null`, {
      encoding: "utf-8",
      cwd: CWD,
      timeout: 5000,
    });
    browserOpen = listOutput.includes('"status": "open"') || listOutput.includes("open");
  } catch (e) {
    // No browser running
  }

  // Step 2: Open browser if not already open
  if (!browserOpen) {
    console.log("  Opening browser...");
    try {
      execSync(`${cli} open --browser chromium --config=.playwright/cli.config.json`, {
        stdio: "pipe",
        cwd: CWD,
        timeout: 15000,
      });
    } catch (e) {
      // open command exits after launch, that's expected
    }
    // Wait for browser to initialize
    console.log("  Waiting for browser to initialize...");
    execSync("sleep 2", { cwd: CWD });
  } else {
    console.log("  Browser already open, reusing session.");
  }

  // Step 3: Load auth state if available
  if (hasAuth) {
    console.log("  Loading auth state...");
    try {
      execSync(`${cli} state-load ${path.join(factBase, "auth-state.json")}`, {
        stdio: "pipe",
        cwd: CWD,
        timeout: 10000,
      });
    } catch (e) {
      console.log("  ⚠️ Could not load auth state.");
    }
  } else {
    console.log("  ⚠️ No auth state found. Run 'doc-verify login' first.");
  }

  // Step 4: Navigate to console URL (this also triggers auth state to take effect)
  console.log(`  Navigating to: ${consoleUrl}`);
  try {
    execSync(`${cli} goto "${consoleUrl}"`, {
      stdio: "pipe",
      cwd: CWD,
      timeout: 30000,
    });
  } catch (e) {
    console.log("  ⚠️ Navigation may have failed. Try manually in the browser.");
  }

  // Step 5: Verify login
  console.log("  Checking login status...");
  execSync("sleep 3", { cwd: CWD });
  try {
    const snapshot = execSync(`${cli} snapshot --raw 2>/dev/null`, {
      encoding: "utf-8",
      cwd: CWD,
      timeout: 10000,
    });
    const needsLogin =
      snapshot.includes("log in") ||
      snapshot.includes("Log In") ||
      snapshot.includes("Sign in") ||
      snapshot.includes("sign-in") ||
      (snapshot.includes("password") && snapshot.includes("email"));

    if (needsLogin) {
      console.log("\n  ⚠️ Login required! The browser is open — please log in manually.");
      console.log("  After logging in, save the auth state with:");
      console.log("    npx doc-verify login-save\n");
    } else {
      console.log("  ✅ Logged in successfully!");
    }
  } catch (e) {
    console.log("  ⚠️ Could not verify login status. Check the browser window.");
  }

  // Step 6: Take screenshot
  try {
    execSync(`${cli} screenshot`, {
      stdio: "pipe",
      cwd: CWD,
      timeout: 10000,
    });
    console.log("  📸 Screenshot saved to " + path.join(factBase, "console-facts", "screenshots", ""));
  } catch (e) {
    // ignore
  }

  console.log("\n  Browser is ready. Use Playwright CLI commands to interact:");
  console.log(`    ${cli} snapshot          # Get page structure`);
  console.log(`    ${cli} screenshot        # Take screenshot`);
  console.log(`    ${cli} goto <url>        # Navigate to URL`);
  console.log(`    ${cli} click <selector>  # Click element`);
  console.log(`    ${cli} eval <js>         # Run JavaScript`);
  console.log(`    ${cli} close             # Close browser\n`);
}

async function cmdLoginSave() {
  console.log("\n💾 doc-verify login-save — Save current auth state\n");

  const configPath = path.join(CWD, "config", "project.json");
  let factBase = "fact-base/unknown-en";
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    factBase = config.fact_base || factBase;
  }

  const authPath = path.join(CWD, factBase, "auth-state.json");
  const cli = "npx @playwright/cli@latest";

  try {
    execSync(`${cli} state-save "${authPath}"`, {
      stdio: "inherit",
      cwd: CWD,
    });
    console.log(`\n✅ Auth state saved to: ${authPath}`);
  } catch (e) {
    console.log(`\n⚠️ Could not save auth state. Is the browser open?`);
  }
}

async function main() {
  const command = process.argv[2];

  switch (command) {
    case "init":
      await cmdInit();
      break;
    case "install":
      await cmdInstall();
      break;
    case "login":
      await cmdLogin();
      break;
    case "console":
      await cmdConsole();
      break;
    case "login-save":
      await cmdLoginSave();
      break;
    default:
      console.log(`
doc-verify — Technical documentation verification toolkit

Usage:
  doc-verify init          Create a new verification project
  doc-verify install       Install skills to AI agent directories
  doc-verify login         Open browser for manual login (saves auth state)
  doc-verify console       Open browser with saved auth state (one command)
  doc-verify login-save    Save auth state from currently open browser

Options:
  --skills                 Install all skills (use with 'install')

Examples:
  doc-verify init
  doc-verify install --skills
  doc-verify login
  doc-verify console       # One command to open browser + load auth + navigate
      `);
  }
}

main().catch(console.error);
