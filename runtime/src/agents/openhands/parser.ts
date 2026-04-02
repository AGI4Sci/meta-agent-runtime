import { ParseError } from "../../core/errors";
import type { ActionParser } from "../../core/interfaces";
import type { Action } from "../../core/types";

interface OpenHandsResponse {
  thought?: unknown;
  tool?: {
    name?: unknown;
    arguments?: unknown;
  };
  name?: unknown;
  arguments?: unknown;
  args?: unknown;
}

export class OpenHandsActionParser implements ActionParser {
  parse(rawText: string): Action {
    const parsed = this.parseJson(rawText);
    const toolName = this.readToolName(parsed);
    const args = this.readArgs(parsed);

    if (!toolName) {
      throw new ParseError("OpenHands response must include a tool name.", rawText);
    }

    if (toolName === "finish") {
      return {
        name: "finish",
        args: { result: String((args.message ?? args.result ?? "") as string) },
        rawText,
      };
    }

    return {
      name: toolName,
      args,
      rawText,
    };
  }

  private parseJson(rawText: string): OpenHandsResponse {
    try {
      return JSON.parse(rawText) as OpenHandsResponse;
    } catch (error) {
      throw new ParseError(
        `OpenHands parser expected JSON output. ${error instanceof Error ? error.message : String(error)}`,
        rawText,
      );
    }
  }

  private readToolName(parsed: OpenHandsResponse): string | null {
    const candidate = parsed.tool?.name ?? parsed.name;
    return typeof candidate === "string" ? candidate : null;
  }

  private readArgs(parsed: OpenHandsResponse): Record<string, unknown> {
    const candidate = parsed.tool?.arguments ?? parsed.arguments ?? parsed.args ?? {};
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return { ...(candidate as Record<string, unknown>) };
    }
    throw new ParseError("OpenHands tool arguments must be a JSON object.", JSON.stringify(parsed));
  }
}
