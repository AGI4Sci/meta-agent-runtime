import path from "node:path";
import type { ToolSpec } from "../core/toolSpec";

function ensureWithinWorkspace(workspaceRoot: string, targetPath: string): string {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(targetPath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace root: ${targetPath}`);
  }
  return resolved;
}

function resolveWorkspacePath(workspaceRoot: string, targetPath: string): string {
  if (path.isAbsolute(targetPath)) {
    return ensureWithinWorkspace(workspaceRoot, targetPath);
  }
  return ensureWithinWorkspace(workspaceRoot, path.join(workspaceRoot, targetPath));
}

export function scopeToolsToWorkspace(tools: ToolSpec[], workspaceRoot?: string): ToolSpec[] {
  if (!workspaceRoot) {
    return tools;
  }

  return tools.map((tool) => {
    if (tool.name === "bash" || tool.name === "search") {
      return {
        ...tool,
        call: (args) => {
          const nextArgs = { ...args };
          const rawCwd = typeof nextArgs.cwd === "string" ? nextArgs.cwd : workspaceRoot;
          nextArgs.cwd = resolveWorkspacePath(workspaceRoot, rawCwd);
          return tool.call(nextArgs);
        },
      };
    }

    if (tool.name === "file_read" || tool.name === "file_write" || tool.name === "file_edit") {
      return {
        ...tool,
        call: (args) => {
          const nextArgs = { ...args };
          if (typeof nextArgs.path === "string") {
            nextArgs.path = resolveWorkspacePath(workspaceRoot, nextArgs.path);
          }
          return tool.call(nextArgs);
        },
      };
    }

    return tool;
  });
}
