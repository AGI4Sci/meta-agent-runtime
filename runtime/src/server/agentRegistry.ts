import type { ActionParser, ContextStrategy, LLMClient, PromptBuilder } from "../core/interfaces";
import type { ToolSpec } from "../core/toolSpec";
import {
  createClaudeCodeSourcemapActionParser,
  createClaudeCodeSourcemapContextStrategy,
  createClaudeCodeSourcemapPromptBuilder,
  getClaudeCodeSourcemapToolPreset,
} from "../../../packages/agents/claude-code-sourcemap/src";
import {
  createClineActionParser,
  createClineContextStrategy,
  createClinePromptBuilder,
  getClineToolPreset,
} from "../../../packages/agents/cline/src";
import {
  GOOSE_TOOL_PRESET,
  createGooseActionParser,
  createGooseContextStrategy,
  createGoosePromptBuilder,
} from "../../../packages/agents/goose/src";
import {
  IIAgentActionParser,
  IIAgentContextStrategy,
  IIAgentPromptBuilder,
  iiAgentToolPreset,
} from "../../../packages/agents/ii-agent/src";
import {
  createOpenCodeActionParser,
  createOpenCodeContextStrategy,
  createOpenCodePromptBuilder,
  createOpenCodeToolPreset,
} from "../../../packages/agents/opencode/src";
import {
  createOpenHandsActionParser,
  createOpenHandsContextStrategy,
  createOpenHandsPromptBuilder,
  createOpenHandsTools,
  OPENHANDS_ACTION_PARSER,
  OPENHANDS_CONTEXT_STRATEGY,
  OPENHANDS_PROMPT_BUILDER,
  OPENHANDS_TOOL_PRESET,
} from "../../../packages/agents/openhands/src";
import {
  createPiMonoActionParser,
  createPiMonoContextStrategy,
  createPiMonoPromptBuilder,
  piMonoCodingTools,
  piMonoReadonlyTools,
} from "../../../packages/agents/pi-mono/src";

export interface RegistryFactoryParams {
  maxTokens?: number;
  llm?: LLMClient;
}

interface NamedPromptBuilderRegistration {
  name: string;
  create: () => PromptBuilder;
}

interface NamedActionParserRegistration {
  name: string;
  create: () => ActionParser;
}

interface NamedContextStrategyRegistration {
  name: string;
  create: (params: RegistryFactoryParams) => ContextStrategy;
}

interface NamedToolPresetRegistration {
  name: string;
  create: () => ToolSpec[];
}

export interface AgentRegistration {
  agent: string;
  promptBuilders?: NamedPromptBuilderRegistration[];
  actionParsers?: NamedActionParserRegistration[];
  contextStrategies?: NamedContextStrategyRegistration[];
  toolPresets?: NamedToolPresetRegistration[];
}

export const AGENT_REGISTRATIONS: AgentRegistration[] = [
  {
    agent: "claude-code-sourcemap",
    promptBuilders: [{ name: "claude_code_sourcemap", create: () => createClaudeCodeSourcemapPromptBuilder() }],
    actionParsers: [{ name: "claude_code_sourcemap", create: () => createClaudeCodeSourcemapActionParser() }],
    contextStrategies: [{ name: "claude_code_sourcemap", create: () => createClaudeCodeSourcemapContextStrategy() }],
    toolPresets: [{ name: "claude_code_sourcemap", create: () => getClaudeCodeSourcemapToolPreset() }],
  },
  {
    agent: "goose",
    promptBuilders: [{ name: "goose", create: () => createGoosePromptBuilder() }],
    actionParsers: [{ name: "goose", create: () => createGooseActionParser() }],
    contextStrategies: [{ name: "goose", create: () => createGooseContextStrategy() }],
    toolPresets: [{ name: "goose", create: () => GOOSE_TOOL_PRESET }],
  },
  {
    agent: "ii-agent",
    promptBuilders: [{ name: "ii_agent", create: () => new IIAgentPromptBuilder() }],
    actionParsers: [{ name: "ii_agent", create: () => new IIAgentActionParser() }],
    contextStrategies: [
      { name: "ii_agent", create: ({ maxTokens = 8000 }) => new IIAgentContextStrategy(maxTokens) },
    ],
    toolPresets: [{ name: "ii_agent", create: () => iiAgentToolPreset }],
  },
  {
    agent: "pi-mono",
    promptBuilders: [{ name: "pi_mono", create: () => createPiMonoPromptBuilder() }],
    actionParsers: [{ name: "pi_mono", create: () => createPiMonoActionParser() }],
    contextStrategies: [
      { name: "pi_mono", create: ({ maxTokens = 8000 }) => createPiMonoContextStrategy(maxTokens) },
    ],
    toolPresets: [
      { name: "pi_mono_coding", create: () => piMonoCodingTools },
      { name: "pi_mono_readonly", create: () => piMonoReadonlyTools },
    ],
  },
  {
    agent: "opencode",
    promptBuilders: [{ name: "opencode", create: () => createOpenCodePromptBuilder() }],
    actionParsers: [{ name: "opencode", create: () => createOpenCodeActionParser() }],
    contextStrategies: [
      { name: "opencode", create: ({ maxTokens = 8000 }) => createOpenCodeContextStrategy(maxTokens) },
    ],
    toolPresets: [{ name: "opencode", create: () => createOpenCodeToolPreset() }],
  },
  {
    agent: "cline",
    promptBuilders: [{ name: "cline", create: () => createClinePromptBuilder() }],
    actionParsers: [{ name: "cline", create: () => createClineActionParser() }],
    contextStrategies: [
      {
        name: "cline",
        create: ({ maxTokens = 8000, llm }) => createClineContextStrategy({ max_tokens: maxTokens, llm }),
      },
    ],
    toolPresets: [{ name: "cline_minimal", create: () => getClineToolPreset() }],
  },
  {
    agent: "openhands",
    promptBuilders: [{ name: OPENHANDS_PROMPT_BUILDER, create: () => createOpenHandsPromptBuilder() }],
    actionParsers: [{ name: OPENHANDS_ACTION_PARSER, create: () => createOpenHandsActionParser() }],
    contextStrategies: [
      {
        name: OPENHANDS_CONTEXT_STRATEGY,
        create: ({ maxTokens = 8000 }) => createOpenHandsContextStrategy({ max_tokens: maxTokens }),
      },
    ],
    toolPresets: [{ name: OPENHANDS_TOOL_PRESET, create: () => createOpenHandsTools() }],
  },
];

export function collectPromptBuilders(): Record<string, () => PromptBuilder> {
  return Object.fromEntries(
    AGENT_REGISTRATIONS.flatMap((registration) =>
      (registration.promptBuilders ?? []).map((entry) => [entry.name, entry.create] as const),
    ),
  );
}

export function collectActionParsers(): Record<string, () => ActionParser> {
  return Object.fromEntries(
    AGENT_REGISTRATIONS.flatMap((registration) =>
      (registration.actionParsers ?? []).map((entry) => [entry.name, entry.create] as const),
    ),
  );
}

export function collectContextStrategies(): Record<
  string,
  (params: RegistryFactoryParams) => ContextStrategy
> {
  return Object.fromEntries(
    AGENT_REGISTRATIONS.flatMap((registration) =>
      (registration.contextStrategies ?? []).map((entry) => [entry.name, entry.create] as const),
    ),
  );
}

export function collectToolPresets(): Record<string, ToolSpec[]> {
  return Object.fromEntries(
    AGENT_REGISTRATIONS.flatMap((registration) =>
      (registration.toolPresets ?? []).map((entry) => [entry.name, entry.create()] as const),
    ),
  );
}
