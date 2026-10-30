"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createEngine } = require("../cli/engine");

const ROOT = path.join(__dirname, "..");
const CLI = path.join(ROOT, "cli", "studio-flow-check.js");
const FIX = path.join(__dirname, "fixtures");
const EXAMPLE = path.join(ROOT, "examples", "main-inbound-example.xml");

function run(args) {
  const res = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  return { code: res.status, out: res.stdout, err: res.stderr };
}

test("engine loads from index.html and exposes the QA analysis", () => {
  const engine = createEngine();
  assert.equal(typeof engine.parseStudioXml, "function");
  assert.equal(typeof engine.analyze, "function");
  assert.ok(engine.CATS.menu, "category table should be loaded");
});

test("example flow reports its known findings and passes by default", () => {
  const res = run([EXAMPLE]);
  assert.equal(res.code, 0);
  assert.match(res.out, /27 steps, 41 branches/);
  assert.match(res.out, /Menu has no invalid-input branch/);
  assert.match(res.out, /Unreachable action/);
  assert.match(res.out, /4 finding\(s\): 0 high, 2 medium, 2 low\./);
});

test("--fail-on med fails the example because it has medium findings", () => {
  assert.equal(run([EXAMPLE, "--fail-on", "med"]).code, 1);
});

test("broken flow reports high-severity problems and fails by default", () => {
  const res = run([path.join(FIX, "broken-flow.xml")]);
  assert.equal(res.code, 1);
  assert.match(res.out, /HIGH\s+Branch points to a missing action/);
  assert.match(res.out, /HIGH\s+Loop with no way out/);
  assert.match(res.out, /MED\s+Integration has no error branch/);
  assert.match(res.out, /MED\s+Menu has no timeout branch/);
});

test("--fail-on never always exits 0 for findings", () => {
  assert.equal(run([path.join(FIX, "broken-flow.xml"), "--fail-on", "never"]).code, 0);
});

test("--lib resolves RUNSUB links against an uploaded subscript", () => {
  const without = run([path.join(FIX, "broken-flow.xml")]);
  assert.match(without.out, /Subscript not in the library/);

  const withLib = run([path.join(FIX, "broken-flow.xml"), "--lib", path.join(FIX, "PostCallSurvey.xml")]);
  assert.doesNotMatch(withLib.out, /Subscript not in the library/);
});

test("reference lists turn on skill, hours and script checks", () => {
  const res = run([
    path.join(FIX, "reference-flow.xml"),
    "--skills", path.join(FIX, "skills.csv"),
    "--hours", path.join(FIX, "hours.csv"),
    "--scripts", path.join(FIX, "scripts.csv"),
    "--fail-on", "never",
  ]);
  assert.match(res.out, /Skill not in CXone reference data/);
  assert.match(res.out, /routes to skill "Billing"/);
  assert.match(res.out, /Script not in CXone reference data/);
  // "Support - US Eastern" is in the hours list, so it must not be flagged.
  assert.doesNotMatch(res.out, /Hours profile not in CXone reference data/);
});

test("--json returns parseable output with severities and step ids", () => {
  const res = run([path.join(FIX, "broken-flow.xml"), "--json", "--fail-on", "never"]);
  assert.equal(res.code, 0);
  const data = JSON.parse(res.out);
  assert.equal(data.files.length, 1);
  const file = data.files[0];
  assert.equal(file.name, "Broken Demo Flow");
  assert.equal(file.steps, 8);
  const loop = file.findings.find(f => f.title === "Loop with no way out");
  assert.ok(loop, "loop finding should be present");
  assert.equal(loop.severity, "high");
  assert.ok(loop.step, "finding should name the step");
  assert.equal(data.summary.high, 2);
});

test("invalid XML exits 2 with a friendly message", () => {
  const res = run([path.join(FIX, "invalid.xml")]);
  assert.equal(res.code, 2);
  assert.match(res.out, /isn't valid XML/);
});

test("a missing file exits 2", () => {
  const res = run([path.join(FIX, "does-not-exist.xml")]);
  assert.equal(res.code, 2);
  assert.match(res.out, /cannot read/);
});

test("bad arguments exit 2 with usage", () => {
  const res = run([]);
  assert.equal(res.code, 2);
  assert.match(res.err, /no script files given/);
  assert.match(res.err, /Usage:/);
});

// ---------- tests command ----------

test("tests command writes CSV with a header and one row per test case", () => {
  const res = run(["tests", EXAMPLE]);
  assert.equal(res.code, 0);
  const lines = res.out.replace(/^﻿/, "").trim().split(/\r?\n/);
  assert.match(lines[0], /^"Test ID","Scenario"/);
  assert.match(res.out, /"TC-001"/);
  assert.match(res.err, /18 test case\(s\), 40 of 41 branches covered/);
});

test("tests command writes Gherkin with --format gherkin", () => {
  const res = run(["tests", "--format", "gherkin", EXAMPLE]);
  assert.equal(res.code, 0);
  assert.match(res.out, /^Feature: Main Inbound Line \(example\)/);
  assert.match(res.out, /@TC-001/);
  assert.match(res.out, /Then /);
});

test("tests command writes to --out and reports the file on stderr", () => {
  const os = require("node:os");
  const fs = require("node:fs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sfc-"));
  const out = path.join(dir, "tests.csv");
  const res = run(["tests", "--out", out, EXAMPLE]);
  assert.equal(res.code, 0);
  assert.match(res.err, /Wrote /);
  assert.match(fs.readFileSync(out, "utf8"), /"TC-018"/);
});

test("tests command requires exactly one script", () => {
  assert.equal(run(["tests"]).code, 2);
  assert.equal(run(["tests", EXAMPLE, EXAMPLE]).code, 2);
});

// ---------- mermaid command ----------

test("mermaid command writes a flowchart with one node per step", () => {
  const res = run(["mermaid", path.join(FIX, "flow-v1.xml")]);
  assert.equal(res.code, 0);
  assert.match(res.out, /^flowchart TD/);
  assert.match(res.out, /n0\(\["Begin \[BEGIN\]"\]\)/);
  assert.match(res.out, /n0 -->\|"Default"\| n1/);
});

// ---------- diff command ----------

test("diff command reports added, removed and changed steps", () => {
  const res = run(["diff", path.join(FIX, "flow-v1.xml"), path.join(FIX, "flow-v2.xml")]);
  assert.equal(res.code, 0);
  assert.match(res.out, /ADDED\s+Promo \(#4, PLAY\)/);
  assert.match(res.out, /CHANGED\s+Welcome \(#2\)/);
  assert.match(res.out, /Property Sequence: %welcome\.wav → %welcome_v2\.wav/);
  assert.match(res.out, /1 added, 0 removed, 1 changed\./);
});

test("diff command --json returns the same changes as data", () => {
  const res = run(["diff", "--json", path.join(FIX, "flow-v1.xml"), path.join(FIX, "flow-v2.xml")]);
  assert.equal(res.code, 0);
  const data = JSON.parse(res.out);
  assert.equal(data.added.length, 1);
  assert.equal(data.added[0].caption, "Promo");
  assert.equal(data.removed.length, 0);
  assert.equal(data.changed[0].caption, "Welcome");
});

test("diff command of identical files reports no differences", () => {
  const f = path.join(FIX, "flow-v1.xml");
  const res = run(["diff", f, f]);
  assert.equal(res.code, 0);
  assert.match(res.out, /No differences found\./);
});

test("diff command requires exactly two files", () => {
  assert.equal(run(["diff", EXAMPLE]).code, 2);
});
