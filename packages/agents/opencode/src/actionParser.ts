import { ParseError } from "../../../../runtime/src/core/errors";
import type { ActionParser } from "../../../../runtime/src/core/interfaces";

type ParsedAction = {
  name?: unknown;
  args?: unknown;
  tool?: unknown;
  input?: unknown;
  result?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class OpenCodeActionParser implements ActionParser {
  parse(rawText: string) {
    let parsed: ParsedAction;

    try {
      parsed = JSON.parse(rawText) as ParsedAction;
    } catch {
      throw new ParseError("Invalid JSON action", rawText);
    }

    if (!isRecord(parsed)) {
      throw new ParseError("Expected JSON object action", rawText);
    }

    if (typeof parsed.name === "string") {
      return {
        name: parsed.name,
        args: isRecord(parsed.args) ? parsed.args : {},
        rawText,
      };
    }

    if (typeof parsed.tool === "string") {
      return {
        name: parsed.tool,
        args: isRecord(parsed.input) ? parsed.input : {},
        rawText,
      };
    }

    if (typeof parsed.result === "string") {
      return {
        name: "finish",
        args: { result: parsed.result },
        rawText,
      };
    }

    throw new ParseError("Expected 'name'/'args' or 'tool'/'input' fields", rawText);
  }
}
