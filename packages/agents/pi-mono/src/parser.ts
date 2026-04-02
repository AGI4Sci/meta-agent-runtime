import { ParseError } from "../../../../runtime/src/core/errors";
import type { ActionParser } from "../../../../runtime/src/core/interfaces";
import type { Action } from "../../../../runtime/src/core/types";

const NAME_ALIASES: Record<string, string> = {
  file_read: "read",
  file_edit: "edit",
  file_write: "write",
};

function stripCodeFence(rawText: string): string {
  const trimmed = rawText.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

export class PiMonoActionParser implements ActionParser {
  parse(rawText: string): Action {
    const cleaned = stripCodeFence(rawText);
    let payload: unknown;

    try {
      payload = JSON.parse(cleaned);
    } catch (error) {
      throw new ParseError(
        `Expected a JSON action object. ${error instanceof Error ? error.message : String(error)}`,
        rawText,
      );
    }

    if (!payload || typeof payload !== "object") {
      throw new ParseError("Action payload must be a JSON object.", rawText);
    }

    const candidate = payload as { name?: unknown; args?: unknown };
    if (typeof candidate.name !== "string" || candidate.name.trim().length === 0) {
      throw new ParseError("Action payload must contain a non-empty string 'name'.", rawText);
    }

    const args =
      candidate.args && typeof candidate.args === "object" && !Array.isArray(candidate.args)
        ? (candidate.args as Record<string, unknown>)
        : {};

    const normalizedName = NAME_ALIASES[candidate.name] ?? candidate.name;
    return {
      name: normalizedName,
      args,
      rawText,
    };
  }
}
