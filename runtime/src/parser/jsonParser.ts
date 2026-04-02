import type { ActionParser } from "../core/interfaces";
import { ParseError } from "../core/errors";

export class JSONActionParser implements ActionParser {
  parse(rawText: string) {
    try {
      const parsed = JSON.parse(rawText) as { name?: unknown; args?: unknown };
      if (typeof parsed.name !== "string") {
        throw new ParseError("Expected string field 'name'", rawText);
      }
      const args =
        parsed.args && typeof parsed.args === "object" && !Array.isArray(parsed.args)
          ? (parsed.args as Record<string, unknown>)
          : {};
      return { name: parsed.name, args, rawText };
    } catch (error) {
      if (error instanceof ParseError) {
        throw error;
      }
      throw new ParseError("Invalid JSON action", rawText);
    }
  }
}

