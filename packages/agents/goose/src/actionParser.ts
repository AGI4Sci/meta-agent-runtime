import type { ActionParser } from "../../../../runtime/src/core/interfaces";
import { ParseError } from "../../../../runtime/src/core/errors";

type ParsedEnvelope = Record<string, unknown>;

function extractJsonObject(rawText: string): string {
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }

  const first = rawText.indexOf("{");
  const last = rawText.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return rawText.slice(first, last + 1);
  }

  return rawText.trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readName(parsed: ParsedEnvelope): string | null {
  if (typeof parsed.name === "string") {
    return parsed.name;
  }
  if (typeof parsed.tool === "string") {
    return parsed.tool;
  }
  if (typeof parsed.action === "string") {
    return parsed.action;
  }

  const fn = asRecord(parsed.function);
  if (typeof fn.name === "string") {
    return fn.name;
  }
  return null;
}

function readArgs(parsed: ParsedEnvelope): Record<string, unknown> {
  const direct = [parsed.args, parsed.arguments, parsed.parameters].find((value) => value !== undefined);
  if (direct !== undefined) {
    return asRecord(direct);
  }

  const fn = asRecord(parsed.function);
  const nested = [fn.args, fn.arguments, fn.parameters].find((value) => value !== undefined);
  if (nested !== undefined) {
    return asRecord(nested);
  }

  if (typeof parsed.result === "string") {
    return { result: parsed.result };
  }

  return {};
}

export class GooseActionParser implements ActionParser {
  parse(rawText: string) {
    const candidate = extractJsonObject(rawText);
    let parsed: ParsedEnvelope;

    try {
      parsed = JSON.parse(candidate) as ParsedEnvelope;
    } catch {
      throw new ParseError("Expected a JSON tool action", rawText);
    }

    const name = readName(parsed);
    if (!name) {
      throw new ParseError("Expected tool name in 'name', 'tool', or 'function.name'", rawText);
    }

    return {
      name,
      args: readArgs(parsed),
      rawText,
    };
  }
}
