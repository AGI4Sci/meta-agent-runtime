import type { ContextEntry } from "../../../../runtime/src/core/types";
import { TODO_CURRENT_PREFIX, TODO_UPDATED_PREFIX } from "./constants";

export interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
  priority: "low" | "medium" | "high";
}

export function formatTodos(prefix: string, todos: TodoItem[]): string {
  if (todos.length === 0) {
    return `${prefix}\n(empty)`;
  }

  return [
    prefix,
    ...todos.map((todo) => `- [${todo.status}|${todo.priority}] ${todo.id}. ${todo.content}`),
  ].join("\n");
}

export function normalizeTodos(value: unknown): TodoItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item, index) => ({
      id: typeof item.id === "string" ? item.id : String(index + 1),
      content: typeof item.content === "string" ? item.content : "",
      status:
        item.status === "pending" || item.status === "in_progress" || item.status === "completed"
          ? item.status
          : "pending",
      priority:
        item.priority === "low" || item.priority === "medium" || item.priority === "high"
          ? item.priority
          : "medium",
    }));
}

export function isTodoSnapshotEntry(entry: ContextEntry): boolean {
  return (
    entry.role === "tool" &&
    (entry.content.startsWith(TODO_UPDATED_PREFIX) || entry.content.startsWith(TODO_CURRENT_PREFIX))
  );
}

export function findLatestTodoSnapshot(entries: ContextEntry[]): ContextEntry | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry && isTodoSnapshotEntry(entry)) {
      return entry;
    }
  }
  return undefined;
}

export function findLatestTodoSnapshotIndex(entries: ContextEntry[]): number {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry && isTodoSnapshotEntry(entry)) {
      return index;
    }
  }
  return -1;
}
