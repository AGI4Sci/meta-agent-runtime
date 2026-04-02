export const CLAUDE_CODE_SOURCEMAP_ADAPTER_NAME = "claude-code-sourcemap";

export const CLAUDE_CODE_SOURCEMAP_TOOL_NAMES = {
  bash: "Bash",
  read: "Read",
  write: "Write",
  edit: "Edit",
  grep: "Grep",
} as const;

export const CLAUDE_CODE_SOURCEMAP_FUNCTION_CALL_EXAMPLE = [
  "<function_calls>",
  '<invoke name="FUNCTION_NAME">',
  '{"arg":"value"}',
  "</invoke>",
  "</function_calls>",
].join("\n");

export const CLAUDE_CODE_SOURCEMAP_FINISH_EXAMPLE = [
  "<function_calls>",
  '<invoke name="finish">',
  '{"result":"final answer"}',
  "</invoke>",
  "</function_calls>",
].join("\n");

export const CLAUDE_CODE_SOURCEMAP_DEFAULT_MAX_ENTRIES = 12;
