import type { ActionParser } from "../core/interfaces";
import { ParseError } from "../core/errors";

function extractFirstJsonObject(rawText: string): string {
  const text = rawText.trim();
  if (!text) {
    return text;
  }

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : text;

  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }
    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return candidate.slice(start, index + 1);
      }
    }
  }

  return candidate;
}

function inferActionName(parsed: Record<string, unknown>): string | null {
  if (typeof parsed.name === "string" && parsed.name.trim()) {
    return parsed.name;
  }

  const hasPath = typeof parsed.path === "string";
  const hasContent = typeof parsed.content === "string";
  const hasOldText = typeof parsed.old_text === "string";
  const hasNewText = typeof parsed.new_text === "string";

  if (typeof parsed.command === "string") {
    return "bash";
  }
  if (typeof parsed.query === "string" || typeof parsed.pattern === "string") {
    return "search";
  }
  if (hasPath && hasOldText && hasNewText) {
    return "file_edit";
  }
  if (hasPath && hasContent) {
    return "file_write";
  }
  if (hasPath) {
    return "file_read";
  }
  if (typeof parsed.result === "string") {
    return "finish";
  }

  return null;
}

function inferArgs(parsed: Record<string, unknown>): Record<string, unknown> {
  if (parsed.args && typeof parsed.args === "object" && !Array.isArray(parsed.args)) {
    return parsed.args as Record<string, unknown>;
  }

  const next = { ...parsed };
  delete next.name;
  delete next.args;
  return next;
}

export class JSONActionParser implements ActionParser {
  parse(rawText: string) {
    try {
      const parsed = JSON.parse(extractFirstJsonObject(rawText)) as Record<string, unknown>;
      const name = inferActionName(parsed);
      if (typeof name !== "string") {
        throw new ParseError("Expected string field 'name'", rawText);
      }
      return { name, args: inferArgs(parsed), rawText };
    } catch (error) {
      if (error instanceof ParseError) {
        throw error;
      }
      throw new ParseError("Invalid JSON action", rawText);
    }
  }
}
