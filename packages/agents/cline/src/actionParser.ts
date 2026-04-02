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

function coerceValue(key: string, value: string): unknown {
  if (key === "requires_approval") {
    return value.toLowerCase() === "true";
  }
  if (key === "timeout") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

function parseArgs(body: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const tagPattern = /<([a-zA-Z0-9_\-]+)>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(body)) !== null) {
    const [, key, rawValue] = match;
    if (TOOL_NAMES.includes(key as ToolName)) {
      continue;
    }
    args[key] = coerceValue(key, rawValue.trim());
  }

  return args;
}

export class ClineActionParser implements ActionParser {
  parse(rawText: string) {
    const name = findToolName(rawText);
    if (!name) {
      throw new ParseError("Expected a Cline XML tool block", rawText);
    }

    const body = extractToolBody(rawText, name);
    const args = parseArgs(body);

    if (name === "attempt_completion") {
      return {
        name: "finish",
        args: {
          result: String(parseTagValue(body, "result") ?? ""),
          command: parseTagValue(body, "command"),
        },
        rawText,
      };
    }

    return { name, args, rawText };
  }
}
