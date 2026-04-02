import { ParseError } from "../../../../runtime/src/core/errors";
import type { ActionParser } from "../../../../runtime/src/core/interfaces";

const TOOL_NAMES = [
  "execute_command",
  "read_file",
  "write_to_file",
  "replace_in_file",
  "search_files",
  "list_files",
  "attempt_completion",
] as const;

type ToolName = (typeof TOOL_NAMES)[number];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findToolName(rawText: string): ToolName | null {
  for (const name of TOOL_NAMES) {
    const pattern = new RegExp(`<${escapeRegExp(name)}(?:\\s*>|>)`, "i");
    if (pattern.test(rawText)) {
      return name;
    }
  }
  return null;
}

function extractToolBody(rawText: string, name: ToolName): string {
  const pattern = new RegExp(
    `<${escapeRegExp(name)}(?:\\s*>|)>([\\s\\S]*?)</${escapeRegExp(name)}>`,
    "i",
  );
  const match = rawText.match(pattern);
  if (!match) {
    throw new ParseError(`Expected a closed <${name}>...</${name}> block`, rawText);
  }
  return match[1] ?? "";
}

function parseTagValue(body: string, tag: string): string | undefined {
  const pattern = new RegExp(
    `<${escapeRegExp(tag)}>([\\s\\S]*?)</${escapeRegExp(tag)}>`,
    "i",
  );
  const match = body.match(pattern);
  return match?.[1]?.trim();
}

function parseLongTagValue(body: string, tag: string): string | undefined {
  const openTag = `<${tag}>`;
  const closeTag = `</${tag}>`;
  const start = body.indexOf(openTag);
  const end = body.lastIndexOf(closeTag);
  if (start === -1 || end === -1 || end < start) {
    return undefined;
  }
  return body.slice(start + openTag.length, end).trim();
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value.trim().toLowerCase() === "true";
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseToolArgs(name: ToolName, body: string): Record<string, unknown> {
  switch (name) {
    case "execute_command":
      return {
        command: parseTagValue(body, "command") ?? "",
        requires_approval: parseBoolean(parseTagValue(body, "requires_approval")),
        timeout: parseNumber(parseTagValue(body, "timeout")),
      };
    case "read_file":
      return {
        path: parseTagValue(body, "path") ?? "",
      };
    case "write_to_file":
      return {
        path: parseTagValue(body, "path") ?? "",
        content: parseLongTagValue(body, "content") ?? "",
      };
    case "replace_in_file":
      return {
        path: parseTagValue(body, "path") ?? "",
        diff: parseLongTagValue(body, "diff") ?? "",
      };
    case "search_files":
      return {
        path: parseTagValue(body, "path") ?? "",
        regex: parseTagValue(body, "regex") ?? "",
        file_pattern: parseTagValue(body, "file_pattern"),
      };
    case "list_files":
      return {
        path: parseTagValue(body, "path") ?? "",
        recursive: parseBoolean(parseTagValue(body, "recursive")),
      };
    case "attempt_completion":
      return {
        result: parseLongTagValue(body, "result") ?? "",
        command: parseTagValue(body, "command"),
      };
  }
}

function dropUndefinedValues(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

export class ClineActionParser implements ActionParser {
  parse(rawText: string) {
    const name = findToolName(rawText);
    if (!name) {
      throw new ParseError("Expected a Cline XML tool block", rawText);
    }

    const body = extractToolBody(rawText, name);
    const args = dropUndefinedValues(parseToolArgs(name, body));

    if (name === "attempt_completion") {
      return {
        name: "finish",
        args,
        rawText,
      };
    }

    return { name, args, rawText };
  }
}
