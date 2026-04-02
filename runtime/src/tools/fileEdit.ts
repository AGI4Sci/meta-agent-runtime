import { readFile, writeFile } from "node:fs/promises";
import { stringTool } from "./common";

export const fileEditTool = stringTool(
  "file_edit",
  {
    zh: "在 UTF-8 文本文件中替换一个子串。",
    en: "Replace one substring in a UTF-8 text file.",
  },
  {
    type: "object",
    properties: {
      path: { type: "string" },
      old_text: { type: "string" },
      new_text: { type: "string" },
    },
    required: ["path", "old_text", "new_text"],
  },
  async (args) => {
    const path = String(args.path);
    const oldText = String(args.old_text);
    const newText = String(args.new_text);
    const source = await readFile(path, "utf8");
    const next = source.replace(oldText, newText);
    await writeFile(path, next, "utf8");
    return `Edited ${path}`;
  },
);
