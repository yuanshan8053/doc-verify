"use strict";

/**
 * Tiny readline wrapper with default-value display and required validation.
 * Replaces the original 4-line `rl()` helper with something testable.
 */

const readline = require("readline");

function ask(question, opts = {}) {
  const def = opts.default !== undefined ? ` [${opts.default}]` : "";
  const required = opts.required ? " *" : "";
  const prompt = `${question}${required}${def}: `;
  return new Promise((resolve, reject) => {
    const iface = readline.createInterface({ input: process.stdin, output: process.stdout });
    iface.question(prompt, (answer) => {
      iface.close();
      const trimmed = (answer || "").trim();
      const value = trimmed === "" ? (opts.default ?? "") : trimmed;
      if (opts.required && value === "") {
        reject(new Error(`${question} is required`));
        return;
      }
      if (opts.validate) {
        const verdict = opts.validate(value);
        if (verdict !== true) {
          reject(new Error(typeof verdict === "string" ? verdict : `Invalid value: ${value}`));
          return;
        }
      }
      resolve(value);
    });
  });
}

async function askBool(question, def = false) {
  const answer = await ask(`${question} (y/n)`, { default: def ? "y" : "n" });
  return /^y(es)?$/i.test(answer);
}

module.exports = { ask, askBool };
