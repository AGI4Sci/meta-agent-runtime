import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";
import { bashTool } from "../../../../runtime/src/tools/bash";
import { fileEditTool } from "../../../../runtime/src/tools/fileEdit";
import { fileReadTool } from "../../../../runtime/src/tools/fileRead";
import { fileWriteTool } from "../../../../runtime/src/tools/fileWrite";
import { searchTool } from "../../../../runtime/src/tools/search";

function aliasTool(
  tool: ToolSpec,
  overrides: Pick<ToolSpec, "name" | "description">,
): ToolSpec {
  return {
    ...tool,
    name: overrides.name,
    description: overrides.description,
  };
}

export const iiAgentToolPreset: ToolSpec[] = [
  aliasTool(bashTool, {
    name: "ShellRunCommand",
    description:
      "Run a shell command in the current workspace. Use this for build, test, git, and inspection commands.",
  }),
  aliasTool(fileReadTool, {
    name: "FileRead",
    description: "Read a UTF-8 text file from disk.",
  }),
  aliasTool(fileWriteTool, {
    name: "FileWrite",
    description: "Write UTF-8 content to a file, replacing the previous contents.",
  }),
  aliasTool(fileEditTool, {
    name: "FileEdit",
    description: "Apply a direct text replacement to a UTF-8 file.",
  }),
  aliasTool(searchTool, {
    name: "SearchCode",
    description: "Search the workspace with ripgrep and return matching lines.",
  }),
];
