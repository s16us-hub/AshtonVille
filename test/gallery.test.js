"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");

test("committed example gallery matches the current tool output", () => {
  const res = spawnSync(process.execPath, [path.join(ROOT, "scripts", "build-gallery.js"), "--check"], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr || res.stdout);
});

test("every gallery page exists and has a title", () => {
  for (const name of ["README.md", "main-inbound.md", "broken-flow.md", "reference-check.md", "version-diff.md"]) {
    const text = fs.readFileSync(path.join(ROOT, "docs", "gallery", name), "utf8");
    assert.match(text, /^# .+/m, `${name} needs a heading`);
  }
});
