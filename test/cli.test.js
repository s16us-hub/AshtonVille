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
