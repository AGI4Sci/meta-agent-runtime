import type { LocalizedText, ToolSpec } from "../core/toolSpec";
import { safeInterpreter, safeObservation } from "../core/toolSpec";

export function stringTool(
  name: string,
  description: string | LocalizedText,
  argsSchema: Record<string, unknown>,
  call: ToolSpec["call"],
): ToolSpec {
  return {
    name,
    description,
    argsSchema,
    call,
    interpreter: safeInterpreter((raw) => safeObservation(String(raw ?? ""))),
  };
}
