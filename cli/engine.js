"use strict";

// The command-line tools run the same logic as the browser tool. Rather than
// keep a second copy, this file reads index.html and evaluates the parts that
// are pure logic: the category table, parser, QA analysis, version diff, test
// generation and Mermaid export. Only the browser's DOMParser is replaced (with
// @xmldom/xmldom). None of the UI code is run.
//
// Named functions are located by their header line and end at the closing
// "  }" at the same indent. If the browser code is refactored and a name
// disappears, createEngine() throws a clear error. The test suite catches it.

const fs = require("node:fs");
const path = require("node:path");
const { DOMParser: XmlDomParser } = require("@xmldom/xmldom");

const HTML_PATH = path.join(__dirname, "..", "index.html");

// The parser and analysis: from the category table up to the browser state.
const ENGINE_START = "  // ---------- Categories ----------";
const ENGINE_END = "  // ---------- State ----------";

// Pure helpers the browser defines in its UI sections. Each is extracted by name.
const FUNCTIONS = ["parseCsv", "namesFrom", "diffFlows", "edgeStep", "describeTest", "genTests", "testsCsv", "testsFeature", "toMermaid"];
const CONSTS = ["trunc", "csvCell", "safeFile"];

// Mirrors the browser's DOMParser. Invalid XML must come back as a document
// containing a <parsererror> element, which is how the parser detects it.
class StrictDOMParser {
  parseFromString(text, type) {
    let failed = false;
    const parser = new XmlDomParser({
      onError(level) {
        if (level === "error" || level === "fatalError") failed = true;
      },
    });
    let doc = null;
    try {
      doc = parser.parseFromString(text, type);
    } catch {
      failed = true;
    }
    if (failed || !doc) {
      return { getElementsByTagName: name => (name === "parsererror" ? [{}] : []) };
    }
    return doc;
  }
}

function sectionBetween(html, startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start + 1);
  if (start < 0 || end < 0) {
    throw new Error(`Could not find the engine section "${startMarker.trim()}" in index.html. Update cli/engine.js.`);
  }
  return html.slice(start, end);
}

// Returns the source of `  function NAME(...) {` through its closing `  }`,
// or the source of a one-line `  const NAME = ...;`.
function extractNamed(html, name) {
  const lines = html.split("\n");
  const fn = lines.findIndex(l => l.startsWith(`  function ${name}(`));
  if (fn >= 0) {
    const close = lines.findIndex((l, i) => i > fn && l === "  }");
    if (close < 0) throw new Error(`Could not find the end of function ${name} in index.html. Update cli/engine.js.`);
    return lines.slice(fn, close + 1).join("\n");
  }
  const konst = lines.find(l => l.startsWith(`  const ${name} = `) && l.trimEnd().endsWith(";"));
  if (konst) return konst;
  throw new Error(`Could not find ${name} in index.html. Update cli/engine.js.`);
}

let cachedSource = null;
function engineSource() {
  if (!cachedSource) {
    const html = fs.readFileSync(HTML_PATH, "utf8");
    const parts = [sectionBetween(html, ENGINE_START, ENGINE_END)];
    for (const name of CONSTS) parts.push(extractNamed(html, name));
    for (const name of FUNCTIONS) parts.push(extractNamed(html, name));
    cachedSource = parts.join("\n");
  }
  return cachedSource;
}

// Placeholder for the browser's built-in sample flow. The CLI has no sample
// entry, so this name never matches a real subscript.
const NO_SAMPLE = { name: "__no_sample__", fileName: "__no_sample__", flow: { actions: [], edges: [] } };

const EXPORTS = [
  "CATS", "classify", "parseStudioXml", "analyze", "parseCsv", "namesFrom",
  "diffFlows", "genTests", "testsCsv", "testsFeature", "toMermaid", "trunc",
];

// Returns the engine bound to a fresh state object. Callers set:
//   state.current  { name, flow }   the flow being checked, for test/mermaid
//   state.an       analyze() result for that flow (required by genTests)
//   state.local    Map of library entries for subscript lookups
//   state.ref      { enabled, skills, hours, scripts } reference lists
function createEngine() {
  const state = { current: null, an: null, remote: new Map(), local: new Map(), ref: null, tests: null };
  const factory = new Function(
    "DOMParser", "state", "SAMPLE_ENTRY",
    engineSource() + "\nreturn { " + EXPORTS.join(", ") + " };"
  );
  const engine = factory(StrictDOMParser, state, NO_SAMPLE);
  return { ...engine, state };
}

module.exports = { createEngine };
