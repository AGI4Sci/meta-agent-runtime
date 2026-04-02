import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { searchTool } from "../src/tools/search";

test("search tool treats file cwd as its parent directory", async () => {
  const root = mkdtempSync(join(tmpdir(), "search-tool-"));
  try {
    const nestedDir = join(root, "pkg");
    mkdirSync(nestedDir);
    const targetFile = join(nestedDir, "example.py");
    writeFileSync(targetFile, "def sympify(value):\n    return value\n", "utf8");

    const result = await searchTool.call({
      query: "def sympify",
      cwd: targetFile,
    });

    assert.match(String(result), /example\.py:1:def sympify/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("search tool falls back to fixed strings when query is invalid regex", async () => {
  const root = mkdtempSync(join(tmpdir(), "search-tool-"));
  try {
    const targetFile = join(root, "example.py");
    writeFileSync(targetFile, "def sympify(value):\n    return value\n", "utf8");

    const result = await searchTool.call({
      query: "def sympify(",
      cwd: root,
    });

    assert.match(String(result), /example\.py:1:def sympify\(value\)/);
    assert.doesNotMatch(String(result), /regex parse error/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
