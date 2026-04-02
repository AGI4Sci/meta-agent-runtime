import { execFileSync } from "node:child_process";
import { stringTool } from "./common";

function asText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  return "";
}

export const bashTool = stringTool(
  "bash",
  "Execute a shell command in the current workspace and return stdout/stderr.",
  {
    type: "object",
    properties: {
      command: { type: "string" },
      cwd: { type: "string" },
    },
    required: ["command"],
  },
  async (args) => {
    const command = String(args.command);
    const cwd = typeof args.cwd === "string" ? args.cwd : process.cwd();
    const shell = process.env.SHELL && process.env.SHELL.trim() ? process.env.SHELL : "/bin/sh";
    const shellArgs = shell.endsWith("zsh") || shell.endsWith("bash") ? ["-lc", command] : ["-c", command];
    const timeout = typeof args.timeout_ms === "number" ? Number(args.timeout_ms) : 30_000;
    const maxBuffer = 4 * 1024 * 1024;
    try {
      const stdout = execFileSync(shell, shellArgs, {
        cwd,
        encoding: "utf8",
        timeout,
        maxBuffer,
      });
      return stdout.trim();
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { stdout?: unknown; stderr?: unknown };
      const stdout = asText(err.stdout);
      const stderr = asText(err.stderr);
      if (stdout || stderr) {
        return stderr ? `${stdout}\n${stderr}`.trim() : stdout.trim();
      }
      throw error;
    }
  },
);
