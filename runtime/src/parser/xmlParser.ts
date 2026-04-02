import type { ActionParser } from "../core/interfaces";
import { ParseError } from "../core/errors";

export class XMLActionParser implements ActionParser {
  parse(rawText: string) {
    const match = rawText.match(/<tool_call\s+name="([^"]+)">([\s\S]*)<\/tool_call>/);
    if (!match) {
      throw new ParseError("Expected <tool_call name=\"...\">...</tool_call>", rawText);
    }
    const [, name, body] = match;
    let args: Record<string, unknown> = {};
    if (body.trim()) {
      try {
        args = JSON.parse(body);
      } catch {
        throw new ParseError("Invalid JSON body inside tool_call", rawText);
      }
    }
    return { name, args, rawText };
  }
}

