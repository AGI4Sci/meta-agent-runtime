import type { ActionParser } from "../core/interfaces";
import { ParseError } from "../core/errors";

export class ReActActionParser implements ActionParser {
  parse(rawText: string) {
    const match = rawText.match(/Action:\s*([a-zA-Z0-9_\-]+)\(([\s\S]*)\)\s*$/);
    if (!match) {
      throw new ParseError("Expected ReAct format: Action: tool({...})", rawText);
    }
    const [, name, argsText] = match;
    let args: Record<string, unknown> = {};
    if (argsText.trim()) {
      try {
        args = JSON.parse(argsText);
      } catch {
        throw new ParseError("Invalid JSON args in ReAct action", rawText);
      }
    }
    return { name, args, rawText };
  }
}

