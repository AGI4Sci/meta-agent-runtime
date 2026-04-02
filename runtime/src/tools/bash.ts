import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stringTool } from "./common";

const execFileAsync = promisify(execFile);

export const bashTool = stringTool(
  "bash",
  {
    zh: "在当前工作目录执行 shell 命令，并返回 stdout/stderr。",
    en: "Execute a shell command in the current workspace and return stdout/stderr.",
  },
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
    const { stdout, stderr } = await execFileAsync("/bin/zsh", ["-lc", command], { cwd });
    return stderr ? `${stdout}\n${stderr}`.trim() : stdout.trim();
  },
);
