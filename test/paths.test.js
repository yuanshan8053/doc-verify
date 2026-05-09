"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { build, consoleSlug } = require("../src/lib/paths");

test("paths.build: rel and abs paths", () => {
  const p = build("/repo/proj", "fact-base/x-y-en");
  assert.equal(p.rel.factBase, "fact-base/x-y-en");
  assert.equal(p.rel.uiConsoleFacts, "fact-base/x-y-en/console-facts/ui-console-facts.json");
  assert.equal(p.abs.uiConsoleFacts, "/repo/proj/fact-base/x-y-en/console-facts/ui-console-facts.json");
  assert.equal(p.sourceFact("caching"), "fact-base/x-y-en/source-facts/caching.json");
  assert.equal(p.report("caching-rules"), "fact-base/x-y-en/reports/caching-rules-diff-report.md");
});

test("consoleSlug: strips console., picks first label", () => {
  assert.equal(consoleSlug("https://console.byteplus.com"), "byteplus");
  assert.equal(consoleSlug("https://console.byteplus.com.cn"), "byteplus");
  assert.equal(consoleSlug("https://my-console.example.io"), "my-console");
  assert.equal(consoleSlug(""), "unknown");
  assert.equal(consoleSlug(null), "unknown");
});
