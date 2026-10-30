"use strict";

// The checker runs the same parser and QA analysis as the browser tool.
// Rather than keep a second copy of that logic, this file reads index.html,
// takes the parser and analysis sections, and evaluates them here. Only the
// browser's DOMParser is swapped for @xmldom/xmldom. The UI code is never run.
//
// If you move or rename the marked sections in index.html, update the markers
// below. The test suite will fail if they stop matching.

const fs = require("node:fs");
const path = require("node:path");
const { DOMParser: XmlDomParser } = require("@xmldom/xmldom");

const HTML_PATH = path.join(__dirname, "..", "index.html");

// Parser and analysis code: from the category table up to the browser state.
const ENGINE_START = "  // ---------- Categories ----------";
const ENGINE_END = "  // ---------- State ----------";
// CSV and reference-list helpers, which sit in the reference section.
const CSV_START = "  function parseCsv(text) {";
const CSV_END = "  function renderRef() {";

// Mirrors the browser's DOMParser: invalid XML must come back as a document
// that contains a <parsererror> element, which is how the parser detects it.
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

function section(html, startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start + 1);
  if (start < 0 || end < 0) {
    throw new Error(`Could not find the engine section "${startMarker.trim()}" in index.html. Update cli/engine.js.`);
  }
  return html.slice(start, end);
}

let cachedSource = null;
function engineSource() {
  if (!cachedSource) {
    const html = fs.readFileSync(HTML_PATH, "utf8");
    cachedSource = section(html, ENGINE_START, ENGINE_END) + "\n" + section(html, CSV_START, CSV_END);
  }
  return cachedSource;
}

// Placeholder for the browser's built-in sample flow. The checker has no
// sample entry, so this name never matches a real subscript.
const NO_SAMPLE = { name: "__no_sample__", fileName: "__no_sample__", flow: { actions: [], edges: [] } };

// Returns the engine functions bound to a fresh state object.
// `state.local` holds library flows (Map of key -> entry); `state.ref` holds
// CXone reference lists ({ skills, hours, scripts }).
function createEngine() {
  const state = { current: null, remote: new Map(), local: new Map(), ref: null };
  const factory = new Function(
    "DOMParser", "state", "SAMPLE_ENTRY",
    engineSource() + "\nreturn { CATS, classify, parseStudioXml, analyze, parseCsv, namesFrom };"
  );
  const engine = factory(StrictDOMParser, state, NO_SAMPLE);
  return { ...engine, state };
}

module.exports = { createEngine };
