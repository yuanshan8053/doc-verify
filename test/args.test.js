"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parse } = require("../src/lib/args");

test("args: positional + flags", () => {
  const f = parse(["init", "--non-interactive", "--config", "x.json"], { booleans: ["non-interactive"] });
  assert.deepEqual(f._, ["init"]);
  assert.equal(f["non-interactive"], true);
  assert.equal(f.config, "x.json");
});

test("args: --key=value", () => {
  const f = parse(["validate", "--out=foo/bar.json"]);
  assert.equal(f.out, "foo/bar.json");
});

test("args: --no-flag → false", () => {
  const f = parse(["init", "--no-force"]);
  assert.equal(f.force, false);
});

test("args: trailing boolean", () => {
  const f = parse(["init", "--json"]);
  assert.equal(f.json, true);
});
