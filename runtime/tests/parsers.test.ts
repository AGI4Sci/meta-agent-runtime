import assert from "node:assert/strict";
import test from "node:test";
import { JSONActionParser } from "../src/parser/jsonParser";
import { ReActActionParser } from "../src/parser/reactParser";

test("json parser parses valid payload", () => {
  const parser = new JSONActionParser();
  const action = parser.parse('{"name":"bash","args":{"command":"pwd"}}');
  assert.equal(action.name, "bash");
});

test("json parser extracts the first action from sequential json objects", () => {
  const parser = new JSONActionParser();
  const action = parser.parse(
    '{"name":"bash","args":{"command":"pwd"}}\n{"name":"finish","args":{"result":"done"}}',
  );
  assert.equal(action.name, "bash");
  assert.deepEqual(action.args, { command: "pwd" });
});

test("json parser extracts fenced json action", () => {
  const parser = new JSONActionParser();
  const action = parser.parse('```json\n{"name":"file_read","args":{"path":"a.txt"}}\n```');
  assert.equal(action.name, "file_read");
  assert.deepEqual(action.args, { path: "a.txt" });
});

test("json parser infers bash action from bare command object", () => {
  const parser = new JSONActionParser();
  const action = parser.parse('{"command":"pwd","cwd":"/tmp"}');
  assert.equal(action.name, "bash");
  assert.deepEqual(action.args, { command: "pwd", cwd: "/tmp" });
});

test("json parser infers file_read action from bare path object", () => {
  const parser = new JSONActionParser();
  const action = parser.parse('{"path":"sympy/core/sympify.py"}');
  assert.equal(action.name, "file_read");
  assert.deepEqual(action.args, { path: "sympy/core/sympify.py" });
});

test("json parser infers file_edit action from bare edit object", () => {
  const parser = new JSONActionParser();
  const action = parser.parse(
    '{"path":"a.txt","old_text":"before","new_text":"after"}',
  );
  assert.equal(action.name, "file_edit");
  assert.deepEqual(action.args, {
    path: "a.txt",
    old_text: "before",
    new_text: "after",
  });
});

test("react parser parses action", () => {
  const parser = new ReActActionParser();
  const action = parser.parse('Action: bash({"command":"pwd"})');
  assert.equal(action.name, "bash");
});
