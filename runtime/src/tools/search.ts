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

function runSearch(command: string, args: string[], cwd: string, timeout: number, maxBuffer: number): string {
  try {
    const stdout = execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      timeout,
      maxBuffer,
    });
    return stdout.trim();
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: unknown; stderr?: unknown; status?: number | null };
    const stdout = asText(err.stdout);
    const stderr = asText(err.stderr);
    if (err.status === 1) {
      return stdout.trim();
    }
    if (stdout.trim()) {
      return stderr ? `${stdout}\n${stderr}`.trim() : stdout.trim();
    }
    if (stderr.trim()) {
      return stderr.trim();
    }
    throw error;
  }
}

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
    const timeout = 10_000;
    const maxBuffer = 4 * 1024 * 1024;
    try {
      const regexMatches = runSearch("rg", ["-n", query, "."], cwd, timeout, maxBuffer);
      if (regexMatches) {
        return regexMatches;
      }
      return runSearch("rg", ["-n", "--fixed-strings", query, "."], cwd, timeout, maxBuffer);
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { stdout?: unknown; stderr?: unknown; status?: number | null };
      if (err.code !== "ENOENT") {
        throw error;
      }
      const regexMatches = runSearch("/usr/bin/grep", ["-R", "-n", query, "."], cwd, timeout, maxBuffer);
      if (regexMatches) {
        return regexMatches;
      }
      return runSearch("/usr/bin/grep", ["-R", "-n", "-F", query, "."], cwd, timeout, maxBuffer);
    }
  },
);
