import type { ActionParser } from "../../../../runtime/src/core/interfaces";
import { ParseError } from "../../../../runtime/src/core/errors";
import type { Action } from "../../../../runtime/src/core/types";

function parseJsonArgs(rawArgs: string, rawText: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawArgs) as unknown;
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("Function arguments must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new ParseError(
      `Invalid function call JSON: ${error instanceof Error ? error.message : String(error)}`,
      rawText,
    );
  }
}

export class ClaudeCodeSourcemapActionParser implements ActionParser {
  parse(rawText: string): Action {
    const invokeMatch = rawText.match(
      /<function_calls>\s*<invoke name="([^"]+)">\s*([\s\S]*?)\s*<\/invoke>\s*<\/function_calls>/,
    );
    if (invokeMatch) {
      return {
        name: invokeMatch[1]!,
        args: parseJsonArgs(invokeMatch[2]!, rawText),
        rawText,
      };
    }

    const toolCallMatch = rawText.match(/<tool_call\s+name="([^"]+)">\s*([\s\S]*?)\s*<\/tool_call>/);
    if (toolCallMatch) {
      return {
        name: toolCallMatch[1]!,
        args: parseJsonArgs(toolCallMatch[2]!, rawText),
        rawText,
      };
    }

    const jsonMatch = rawText.trim();
    if (jsonMatch.startsWith("{")) {
      try {
        const parsed = JSON.parse(jsonMatch) as {
          type?: string;
          name?: string;
          args?: Record<string, unknown>;
          input?: Record<string, unknown>;
          tool?: string;
          arguments?: Record<string, unknown>;
        };
        if (parsed.type === "tool_use" && typeof parsed.name === "string" && parsed.input && typeof parsed.input === "object") {
          return { name: parsed.name, args: parsed.input, rawText };
        }
        if (typeof parsed.name === "string" && parsed.args && typeof parsed.args === "object") {
          return { name: parsed.name, args: parsed.args, rawText };
        }
        if (typeof parsed.tool === "string" && parsed.arguments && typeof parsed.arguments === "object") {
          return { name: parsed.tool, args: parsed.arguments, rawText };
        }
      } catch {
        // fall through to the standard parse error below
      }
    }

    throw new ParseError(
      "Expected <function_calls><invoke name=\"...\">{...}</invoke></function_calls>",
      rawText,
    );
  }
}
