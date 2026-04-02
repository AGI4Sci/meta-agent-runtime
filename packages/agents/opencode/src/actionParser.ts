import { ParseError } from "../../../../runtime/src/core/errors";
import type { ActionParser } from "../../../../runtime/src/core/interfaces";

type ParsedAction = {
  name?: unknown;
  args?: unknown;
  arguments?: unknown;
  tool?: unknown;
  input?: unknown;
  result?: unknown;
  toolCall?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractJSONObject(rawText: string): string {
  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }
  return trimmed;
}

export class OpenCodeActionParser implements ActionParser {
  parse(rawText: string) {
    let parsed: ParsedAction;
    const candidate = extractJSONObject(rawText);

    try {
      parsed = JSON.parse(candidate) as ParsedAction;
    } catch {
      throw new ParseError("Invalid JSON action", rawText);
    }

    if (!isRecord(parsed)) {
      throw new ParseError("Expected JSON object action", rawText);
    }

    if (typeof parsed.name === "string") {
      return {
        name: parsed.name,
        args: isRecord(parsed.args) ? parsed.args : isRecord(parsed.arguments) ? parsed.arguments : {},
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

    if (isRecord(parsed.toolCall) && typeof parsed.toolCall.name === "string") {
      return {
        name: parsed.toolCall.name,
        args: isRecord(parsed.toolCall.arguments) ? parsed.toolCall.arguments : {},
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

    throw new ParseError("Expected 'name'/'args', 'name'/'arguments', 'tool'/'input', or toolCall payload", rawText);
  }
}
