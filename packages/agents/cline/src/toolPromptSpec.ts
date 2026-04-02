import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";

export type ClinePromptToolSpec = {
  name: string;
  description: string;
  parameters: string[];
  usage: string[];
};

export const CLINE_PROMPT_TOOL_SPECS: Record<string, ClinePromptToolSpec> = {
  execute_command: {
    name: "execute_command",
    description:
      "Request to execute a CLI command on the system. Tailor the command to the user's system, explain what it does, and set requires_approval=true for impactful operations.",
    parameters: [
      "- command: (required) The CLI command to execute.",
      "- requires_approval: (required) true for impactful operations, false for safe non-destructive commands.",
      "- timeout: (optional) Timeout in seconds.",
    ],
    usage: [
      "<execute_command>",
      "<command>Your command here</command>",
      "<requires_approval>true or false</requires_approval>",
      "<timeout>30</timeout>",
      "</execute_command>",
    ],
  },
  read_file: {
    name: "read_file",
    description:
      "Request to read the contents of a file at the specified path. Do not use this tool to list a directory.",
    parameters: [
      "- path: (required) The path of the file to read.",
    ],
    usage: [
      "<read_file>",
      "<path>File path here</path>",
      "</read_file>",
    ],
  },
  write_to_file: {
    name: "write_to_file",
    description:
      "Request to write content to a file at the specified path. If the file exists it will be overwritten; otherwise it will be created. Always provide the complete intended file content.",
    parameters: [
      "- path: (required) The path of the file to write.",
      "- content: (required) The complete final file content.",
    ],
    usage: [
      "<write_to_file>",
      "<path>File path here</path>",
      "<content>",
      "Complete file content here",
      "</content>",
      "</write_to_file>",
    ],
  },
  replace_in_file: {
    name: "replace_in_file",
    description:
      "Request to replace sections of an existing file using SEARCH/REPLACE blocks. Use this for targeted edits rather than full rewrites.",
    parameters: [
      "- path: (required) The path of the file to modify.",
      "- diff: (required) One or more SEARCH/REPLACE blocks.",
    ],
    usage: [
      "<replace_in_file>",
      "<path>File path here</path>",
      "<diff>",
      "------- SEARCH",
      "[exact content to find]",
      "=======",
      "[new content to replace with]",
      "+++++++ REPLACE",
      "</diff>",
      "</replace_in_file>",
    ],
  },
  search_files: {
    name: "search_files",
    description:
      "Request to perform a regex search across files in a specified directory, returning context-rich results.",
    parameters: [
      "- path: (required) The directory path to search recursively.",
      "- regex: (required) The regular expression pattern to search for.",
      "- file_pattern: (optional) Glob pattern to filter files, such as '*.ts'.",
    ],
    usage: [
      "<search_files>",
      "<path>Directory path here</path>",
      "<regex>Your regex pattern here</regex>",
      "<file_pattern>*.ts</file_pattern>",
      "</search_files>",
    ],
  },
  list_files: {
    name: "list_files",
    description:
      "Request to list files and directories within a specified directory. If recursive is true, list recursively; otherwise list top-level contents only.",
    parameters: [
      "- path: (required) The directory path to inspect.",
      "- recursive: (optional) Whether to list recursively.",
    ],
    usage: [
      "<list_files>",
      "<path>Directory path here</path>",
      "<recursive>true or false</recursive>",
      "</list_files>",
    ],
  },
  finish: {
    name: "attempt_completion",
    description:
      "Use this only after previous tool results have confirmed success and the task is complete. Present the final result to the user and optionally include a demo command.",
    parameters: [
      "- result: (required) A clear, specific summary of the finished work.",
      "- command: (optional) A command to demonstrate the result.",
    ],
    usage: [
      "<attempt_completion>",
      "<result>Your final result description here</result>",
      "<command>Your command here (optional)</command>",
      "</attempt_completion>",
    ],
  },
};

export function getClinePromptToolSpec(tool: ToolSpec): ClinePromptToolSpec {
  return (
    CLINE_PROMPT_TOOL_SPECS[tool.name] ?? {
      name: tool.name,
      description: tool.description,
      parameters: ["- See tool schema in runtime."],
      usage: [`<${tool.name}>...</${tool.name}>`],
    }
  );
}
