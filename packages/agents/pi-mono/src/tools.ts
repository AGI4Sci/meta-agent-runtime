import type { ToolSpec } from "../../../../runtime/src/core/toolSpec";
import { bashTool } from "../../../../runtime/src/tools/bash";
import { fileEditTool } from "../../../../runtime/src/tools/fileEdit";
import { fileReadTool } from "../../../../runtime/src/tools/fileRead";
import { fileWriteTool } from "../../../../runtime/src/tools/fileWrite";
import { searchTool } from "../../../../runtime/src/tools/search";

function aliasTool(tool: ToolSpec, alias: { name: string; description: string }): ToolSpec {
  return {
    ...tool,
    name: alias.name,
    description: alias.description,
  };
}

export const piMonoCodingTools: ToolSpec[] = [
  aliasTool(fileReadTool, { name: "read", description: "Read file contents." }),
  bashTool,
  aliasTool(fileEditTool, { name: "edit", description: "Make surgical edits to files." }),
  aliasTool(fileWriteTool, { name: "write", description: "Create or overwrite files." }),
];

export const piMonoReadonlyTools: ToolSpec[] = [
  aliasTool(fileReadTool, { name: "read", description: "Read file contents." }),
  aliasTool(searchTool, { name: "search", description: "Search file contents with ripgrep." }),
];
