import { writeFile } from "node:fs/promises";
import { stringTool } from "./common";

export const fileWriteTool = stringTool(
  "file_write",
  "Write UTF-8 text content to a file, replacing existing content.",
  {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
  },
  async (args) => {
    await writeFile(String(args.path), String(args.content), "utf8");
    return `Wrote ${String(args.path)}`;
  },
);

