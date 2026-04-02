import { readFile } from "node:fs/promises";
import { stringTool } from "./common";

export const fileReadTool = stringTool(
  "file_read",
  {
    zh: "从磁盘读取 UTF-8 文本文件。",
    en: "Read a UTF-8 text file from disk.",
  },
  {
    type: "object",
    properties: {
      path: { type: "string" },
    },
    required: ["path"],
  },
  async (args) => readFile(String(args.path), "utf8"),
);
