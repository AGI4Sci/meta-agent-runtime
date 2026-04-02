import type { PromptBuilder } from "../core/interfaces";
import type { Context } from "../core/types";
import type { ToolSpec } from "../core/toolSpec";
import { renderContext, renderTools } from "./helpers";

export class ReActPromptBuilder implements PromptBuilder {
  build(task: string, tools: ToolSpec[], context: Context): string {
    return [
      "You are a coding agent operating in a tool loop.",
      "Think briefly, then produce exactly one action as a single JSON object: {\"name\": ..., \"args\": {...}}.",
      "Do not output multiple actions.",
      "Do not output an array of actions.",
      "Do not output sequential JSON objects.",
      "Do not include explanations before or after the JSON object.",
      "The JSON object must include both a top-level 'name' field and a top-level 'args' object.",
      "Do not output bare tool arguments without 'name' and 'args'.",
      "Before making any code change, prefer lightweight inspection actions such as search and file_read.",
      "Do not run full test suites or long pytest commands in the first two steps.",
      "Only run targeted verification after you have identified the likely fix.",
      "When the task is complete, call finish.",
      "",
      `Task:\n${task}`,
      "",
      `Tools:\n${renderTools(tools)}`,
      "",
      `History:\n${renderContext(context)}`,
    ].join("\n");
  }
}
