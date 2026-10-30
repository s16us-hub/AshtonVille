#!/usr/bin/env node
"use strict";

// Command-line QA checks for NICE CXone Studio script exports (.xml).
// Runs the same analysis as the browser tool, so the results match.
//
// Exit codes:
//   0  no findings at or above the --fail-on level
//   1  findings at or above the --fail-on level
//   2  a file could not be read or parsed, or the arguments were wrong

const fs = require("node:fs");
const path = require("node:path");
const { createEngine } = require("./engine");

const SEVERITY_RANK = { low: 1, med: 2, high: 3 };
const SEVERITY_LABEL = { low: "LOW ", med: "MED ", high: "HIGH" };
const FAIL_LEVELS = ["high", "med", "low", "never"];

const USAGE = `Usage: studio-flow-check [options] <script.xml> [more.xml ...]

Checks CXone Studio script exports for dead ends, unreachable steps, missing
timeout or error branches, loops with no exit and broken links.

Options:
  --lib <file.xml>     Extra flow to resolve RUNSUB links against (repeatable).
                       Files given on the command line also resolve each other.
  --skills <file>      Your CXone skills list (CSV or JSON). Enables the skill check.
  --hours <file>       Your CXone hours-of-operation list (CSV or JSON).
  --scripts <file>     Your CXone script list (CSV or JSON).
  --fail-on <level>    Exit 1 when a finding this severe or worse is present:
                       high (default), med, low, or never.
  --json               Print results as JSON instead of text.
  -h, --help           Show this help.
`;

function usageError(message) {
  process.stderr.write(`studio-flow-check: ${message}\n\n${USAGE}`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { files: [], lib: [], skills: null, hours: null, scripts: null, failOn: "high", json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) usageError(`${arg} needs a value`);
      return argv[++i];
    };
    switch (arg) {
      case "-h":
      case "--help":
        process.stdout.write(USAGE);
        process.exit(0);
        break;
      case "--json": opts.json = true; break;
      case "--lib": opts.lib.push(next()); break;
      case "--skills": opts.skills = next(); break;
      case "--hours": opts.hours = next(); break;
      case "--scripts": opts.scripts = next(); break;
      case "--fail-on": opts.failOn = next(); break;
      default:
        if (arg.startsWith("-")) usageError(`unknown option ${arg}`);
        opts.files.push(arg);
    }
  }
  if (!FAIL_LEVELS.includes(opts.failOn)) usageError(`--fail-on must be one of ${FAIL_LEVELS.join(", ")}`);
  if (!opts.files.length) usageError("no script files given");
  return opts;
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (err) {
    throw new Error(`cannot read ${file}: ${err.code || err.message}`);
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const engine = createEngine();
  const { parseStudioXml, analyze, namesFrom, state } = engine;

  // Reference lists are optional; each one turns on one extra check.
  // The browser only runs these checks once "Check against your CXone setup" is on.
  state.ref = { enabled: false };
  for (const [type, file] of [["skills", opts.skills], ["hours", opts.hours], ["scripts", opts.scripts]]) {
    if (!file) continue;
    try {
      state.ref[type] = namesFrom(readText(file), path.basename(file), type);
      state.ref.enabled = true;
    } catch (err) {
      usageError(err.message);
    }
  }

  // Parse every script first so the files can resolve each other's subscripts.
  const results = [];
  const entries = new Map();
  const inputs = [...opts.files, ...opts.lib];
  for (const file of inputs) {
    const isLib = !opts.files.includes(file);
    const result = { file, library: isLib, name: null, steps: 0, branches: 0, findings: [], error: null };
    results.push(result);
    let parsed;
    try {
      parsed = parseStudioXml(readText(file), path.basename(file));
    } catch (err) {
      result.error = err.message;
      continue;
    }
    if (parsed.error) {
      result.error = parsed.error;
      continue;
    }
    const entry = { key: file, name: parsed.flow.name, fileName: path.basename(file), flow: parsed.flow, diag: parsed.diag };
    entries.set(file, entry);
    result.name = parsed.flow.name;
    result.steps = parsed.flow.actions.length;
    result.branches = parsed.flow.edges.length;
  }

  // Analyze each script against the whole library (every other input file).
  for (const result of results) {
    const entry = entries.get(result.file);
    if (!entry || result.library) continue;
    state.local = new Map([...entries].filter(([key]) => key !== result.file));
    state.current = entry;
    result.findings = analyze(entry.flow).findings;
  }

  const failures = results.filter(r => r.error);
  const counts = { high: 0, med: 0, low: 0 };
  for (const r of results) for (const f of r.findings) counts[f.sev] = (counts[f.sev] || 0) + 1;

  if (opts.json) {
    const out = results.filter(r => !r.library).map(r => ({
      file: r.file,
      name: r.name,
      steps: r.steps,
      branches: r.branches,
      error: r.error,
      findings: r.findings.map(f => ({ severity: f.sev, title: f.title, message: f.text, step: f.id })),
    }));
    process.stdout.write(JSON.stringify({ files: out, summary: counts }, null, 2) + "\n");
  } else {
    for (const r of results.filter(x => !x.library)) {
      if (r.error) {
        process.stdout.write(`${r.file}: ERROR ${r.error}\n\n`);
        continue;
      }
      process.stdout.write(`${r.file}: ${r.name || "(unnamed)"} (${r.steps} steps, ${r.branches} branches)\n`);
      if (!r.findings.length) process.stdout.write("  No findings.\n");
      for (const f of r.findings) {
        process.stdout.write(`  ${SEVERITY_LABEL[f.sev]}  ${f.title}${f.id ? ` (step #${f.id})` : ""}\n`);
        process.stdout.write(`        ${f.text}\n`);
      }
      process.stdout.write("\n");
    }
    const total = counts.high + counts.med + counts.low;
    process.stdout.write(`${total} finding(s): ${counts.high} high, ${counts.med} medium, ${counts.low} low.\n`);
  }

  if (failures.length) process.exit(2);
  if (opts.failOn !== "never") {
    const threshold = SEVERITY_RANK[opts.failOn];
    const blocking = results.some(r => r.findings.some(f => SEVERITY_RANK[f.sev] >= threshold));
    if (blocking) process.exit(1);
  }
  process.exit(0);
}

main();
