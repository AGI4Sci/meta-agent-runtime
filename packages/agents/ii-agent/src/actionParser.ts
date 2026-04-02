import { ParseError } from "../../../../runtime/src/core/errors";
import type { ActionParser } from "../../../../runtime/src/core/interfaces";
import type { Action } from "../../../../runtime/src/core/types";

interface CandidateAction {
  name?: unknown;
  args?: unknown;
  tool?: unknown;
  input?: unknown;
  tool_name?: unknown;
  tool_input?: unknown;
  arguments?: unknown;
}

function normalizeArgs(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function extractJsonBlock(rawText: string): string {
  const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const objectMatch = rawText.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return objectMatch[0].trim();
  }

  return rawText.trim();
}

function fromParsedPayload(parsed: CandidateAction, rawText: string): Action {
  if (typeof parsed.name === "string") {
    return { name: parsed.name, args: normalizeArgs(parsed.args), rawText };
  }
  if (typeof parsed.tool === "string") {
    return { name: parsed.tool, args: normalizeArgs(parsed.input ?? parsed.args), rawText };
  }
  if (typeof parsed.tool_name === "string") {
    return { name: parsed.tool_name, args: normalizeArgs(parsed.tool_input), rawText };
  }
  throw new ParseError("Expected a tool name in action payload", rawText);
}

export class IIAgentActionParser implements ActionParser {
  parse(rawText: string): Action {
    const normalized = extractJsonBlock(rawText);
    try {
      const parsed = JSON.parse(normalized) as CandidateAction;
      return fromParsedPayload(parsed, rawText);
    } catch (error) {
      throw new ParseError(
        error instanceof ParseError ? error.message : "Invalid ii-agent action payload",
        rawText,
      );
    }
  }
}
