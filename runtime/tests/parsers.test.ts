import assert from "node:assert/strict";
import test from "node:test";
import { JSONActionParser } from "../src/parser/jsonParser";
import { ReActActionParser } from "../src/parser/reactParser";

test("json parser parses valid payload", () => {
  const parser = new JSONActionParser();
  const action = parser.parse('{"name":"bash","args":{"command":"pwd"}}');
  assert.equal(action.name, "bash");
});

test("react parser parses action", () => {
  const parser = new ReActActionParser();
  const action = parser.parse('Action: bash({"command":"pwd"})');
  assert.equal(action.name, "bash");
});

