import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stringTool } from "./common";

const execFileAsync = promisify(execFile);

export const searchTool = stringTool(
  "search",
  "Search files with ripgrep.",
  {
    type: "object",
    properties: {
      query: { type: "string" },
      cwd: { type: "string" },
    },
    required: ["query"],
  },
  async (args) => {
    const query = String(args.query);
    const cwd = typeof args.cwd === "string" ? args.cwd : process.cwd();
    const { stdout, stderr } = await execFileAsync("rg", ["-n", query], { cwd });
    return stderr ? `${stdout}\n${stderr}`.trim() : stdout.trim();
  },
);

