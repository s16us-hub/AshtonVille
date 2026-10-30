#!/usr/bin/env node
"use strict";

// Command-line tools for NICE CXone Studio script exports (.xml). They run the
// same logic as the browser tool, so results match what you see in the browser.
//
//   studio-flow-check [check] <script.xml...>   QA checks (default command)
//   studio-flow-check tests <script.xml>        Test cases, as CSV or Gherkin
//   studio-flow-check diff <old.xml> <new.xml>  Steps and branches that changed
//   studio-flow-check mermaid <script.xml>      Mermaid flowchart text
//
// Exit codes:
//   0  success, or no findings at or above --fail-on
//   1  findings at or above --fail-on (check only)
//   2  a file could not be read or parsed, or the arguments were wrong

const fs = require("node:fs");
const path = require("node:path");
const { createEngine } = require("./engine");

const SEVERITY_RANK = { low: 1, med: 2, high: 3 };
const SEVERITY_LABEL = { low: "LOW ", med: "MED ", high: "HIGH" };
const FAIL_LEVELS = ["high", "med", "low", "never"];
const COMMANDS = ["check", "tests", "diff", "mermaid"];

const USAGE = `Usage:
  studio-flow-check [check] [options] <script.xml> [more.xml ...]
  studio-flow-check tests [options] <script.xml>
  studio-flow-check diff [options] <old.xml> <new.xml>
  studio-flow-check mermaid [options] <script.xml>

check    Runs QA checks: dead ends, unreachable steps, missing timeout or error
         branches, loops with no exit, broken links. This is the default command.
tests    Generates test cases that cover every reachable branch at least once.
diff     Lists steps and branches added, removed or changed between two exports.
mermaid  Writes the flow as Mermaid flowchart text.

Options:
  --lib <file.xml>     Extra flow to resolve RUNSUB links against (repeatable).
                       Files given on the command line also resolve each other.
  --skills <file>      Your CXone skills list (CSV or JSON). Enables the skill check.
  --hours <file>       Your CXone hours-of-operation list (CSV or JSON).
  --scripts <file>     Your CXone script list (CSV or JSON).
  --fail-on <level>    check only. Exit 1 when a finding this severe or worse is
                       present: high (default), med, low, or never.
  --json               check and diff: print results as JSON.
  --format <fmt>       tests only: csv (default) or gherkin.
  --out <file>         tests and mermaid: write to a file instead of stdout.
  -h, --help           Show this help.
`;

function usageError(message) {
  process.stderr.write(`studio-flow-check: ${message}\n\n${USAGE}`);
  process.exit(2);
}

function fail(message) {
  process.stderr.write(`studio-flow-check: ${message}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  let command = "check";
  if (argv.length && COMMANDS.includes(argv[0])) command = argv.shift();
  const opts = {
    command, files: [], lib: [], skills: null, hours: null, scripts: null,
    failOn: "high", json: false, format: "csv", out: null,
  };
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
      case "--format": opts.format = next(); break;
      case "--out": opts.out = next(); break;
      default:
        if (arg.startsWith("-")) usageError(`unknown option ${arg}`);
        opts.files.push(arg);
    }
  }
  if (!FAIL_LEVELS.includes(opts.failOn)) usageError(`--fail-on must be one of ${FAIL_LEVELS.join(", ")}`);
  if (!["csv", "gherkin"].includes(opts.format)) usageError("--format must be csv or gherkin");
  if (!opts.files.length) usageError("no script files given");
  if (command === "tests" && opts.files.length !== 1) usageError("tests takes exactly one script");
  if (command === "mermaid" && opts.files.length !== 1) usageError("mermaid takes exactly one script");
  if (command === "diff" && opts.files.length !== 2) usageError("diff takes exactly two files: the old export, then the new one");
  return opts;
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (err) {
    throw new Error(`cannot read ${file}: ${err.code || err.message}`);
  }
}

// Parses one export. Returns an entry the engine can use, or throws with a message.
function loadEntry(engine, file) {
  const parsed = engine.parseStudioXml(readText(file), path.basename(file));
  if (parsed.error) throw new Error(`${file}: ${parsed.error}`);
  return { key: file, name: parsed.flow.name, fileName: path.basename(file), flow: parsed.flow, diag: parsed.diag };
}

function setupEngine(opts) {
  const engine = createEngine();
  const { state, namesFrom } = engine;
  // The browser only runs the reference checks once "Check against your CXone setup" is on.
  state.ref = { enabled: false };
  for (const [type, file] of [["skills", opts.skills], ["hours", opts.hours], ["scripts", opts.scripts]]) {
    if (!file) continue;
    try {
      state.ref[type] = namesFrom(readText(file), path.basename(file), type);
      state.ref.enabled = true;
    } catch (err) {
      fail(err.message);
    }
  }
  return engine;
}

function writeOutput(opts, text) {
  if (opts.out) {
    try {
      fs.writeFileSync(opts.out, text, "utf8");
    } catch (err) {
      fail(`cannot write ${opts.out}: ${err.code || err.message}`);
    }
    process.stderr.write(`Wrote ${opts.out}\n`);
  } else {
    process.stdout.write(text.endsWith("\n") ? text : text + "\n");
  }
}

// ---------- check ----------

function runCheck(opts) {
  const engine = setupEngine(opts);
  const { state, parseStudioXml, analyze } = engine;

  // Parse every script first so the files can resolve each other's subscripts.
  const results = [];
  const entries = new Map();
  const inputs = [...opts.files, ...opts.lib];
  for (const file of inputs) {
    const isLib = !opts.files.includes(file);
    const result = { file, library: isLib, name: null, steps: 0, branches: 0, findings: [], error: null };
    results.push(result);
    try {
      const entry = loadEntry(engine, file);
      entries.set(file, entry);
      result.name = entry.name;
      result.steps = entry.flow.actions.length;
      result.branches = entry.flow.edges.length;
    } catch (err) {
      result.error = err.message.replace(`${file}: `, "");
    }
  }

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

// ---------- tests ----------

function runTests(opts) {
  const engine = setupEngine(opts);
  const { state, parseStudioXml, analyze, genTests, testsCsv, testsFeature } = engine;
  const libraryEntries = new Map();
  for (const file of opts.lib) libraryEntries.set(file, loadEntry(engine, file));
  state.local = libraryEntries;

  const entry = loadEntry(engine, opts.files[0]);
  state.current = entry;
  state.an = analyze(entry.flow);
  const gen = genTests();
  state.tests = gen.tests;

  const text = opts.format === "gherkin" ? testsFeature() : testsCsv();
  writeOutput(opts, text);

  const pct = gen.total ? Math.round((gen.covered / gen.total) * 100) : 100;
  process.stderr.write(
    `${gen.tests.length} test case(s), ${gen.covered} of ${gen.total} branches covered (${pct}%)` +
    (gen.unreachable ? `, ${gen.unreachable} branch(es) on unreachable steps` : "") + ".\n"
  );
  process.exit(0);
}

// ---------- diff ----------

function runDiff(opts) {
  const engine = setupEngine(opts);
  const { diffFlows } = engine;
  const [oldFile, newFile] = opts.files;
  const oldEntry = loadEntry(engine, oldFile);
  const newEntry = loadEntry(engine, newFile);
  // The browser compares the flow you're viewing (the newer one) with an older upload.
  const d = diffFlows(newEntry.flow, oldEntry.flow);
  const label = a => a.caption || a.type;

  if (opts.json) {
    process.stdout.write(JSON.stringify({
      old: oldFile,
      new: newFile,
      added: d.added.map(a => ({ id: a.id, type: a.type, caption: a.caption })),
      removed: d.removed.map(a => ({ id: a.id, type: a.type, caption: a.caption })),
      changed: d.changed.map(c => ({ id: c.a.id, caption: label(c.a), changes: c.ch })),
    }, null, 2) + "\n");
  } else {
    process.stdout.write(`Comparing ${path.basename(oldFile)} (old) with ${path.basename(newFile)} (new)\n\n`);
    if (!d.added.length && !d.removed.length && !d.changed.length) process.stdout.write("No differences found.\n");
    for (const a of d.added) process.stdout.write(`ADDED    ${label(a)} (#${a.id}, ${a.type})\n`);
    for (const b of d.removed) process.stdout.write(`REMOVED  ${label(b)} (#${b.id}, ${b.type})\n`);
    for (const c of d.changed) {
      process.stdout.write(`CHANGED  ${label(c.a)} (#${c.a.id})\n`);
      for (const line of c.ch) process.stdout.write(`           ${line}\n`);
    }
    process.stdout.write(`\n${d.added.length} added, ${d.removed.length} removed, ${d.changed.length} changed.\n`);
  }
  process.exit(0);
}

// ---------- mermaid ----------

function runMermaid(opts) {
  const engine = setupEngine(opts);
  const { state, analyze, toMermaid } = engine;
  const entry = loadEntry(engine, opts.files[0]);
  state.current = entry;
  state.an = analyze(entry.flow);
  writeOutput(opts, toMermaid());
  process.exit(0);
}

const opts = parseArgs(process.argv.slice(2));
switch (opts.command) {
  case "tests": runTests(opts); break;
  case "diff": runDiff(opts); break;
  case "mermaid": runMermaid(opts); break;
  default: runCheck(opts);
}
