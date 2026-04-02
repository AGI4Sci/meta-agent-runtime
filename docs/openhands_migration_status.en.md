# OpenHands Migration Status Report

## 1. Objective of This Migration

This migration focused on extracting the minimum runnable OpenHands unit and adapting it to the shared `meta-agent-runtime` framework under the current platform constraints:

- keep agent-specific logic isolated from the shared runtime core whenever possible
- preserve English-only prompts and tool descriptions inside runtime execution paths
- keep documentation split into separate Chinese and English files
- avoid touching other agent migration directories
- prefer the smallest runnable compatibility skeleton over a full fidelity port

The goal of this iteration was not a full OpenHands reimplementation. The goal was to land a minimal compatibility adapter that can run inside the shared linear runtime loop.

## 2. Files and Codepaths Reviewed

### 2.1 Target Repository Documents

The following documents were reviewed before implementation:

- `agent_runtime_design.md`
- `docs/migration.zh.md`
- `README.md`

Key constraints derived from those documents:

- the runtime loop is intentionally linear: `LLM -> Action -> Tool -> Observation`
- the primary migration mapping points are `PromptBuilder`, `ActionParser`, `ContextStrategy`, and `ToolSpec`
- `runtime/src/core/*` should remain agent-agnostic
- new agent behavior should enter through registry wiring rather than core loop changes
- runtime-facing prompts and tool descriptions should remain English-only

### 2.2 Source OpenHands Codepaths

The following OpenHands files were reviewed as the main reference:

- `openhands/controller/agent_controller.py`
- `openhands/controller/action_parser.py`
- `openhands/agenthub/codeact_agent/codeact_agent.py`
- `openhands/agenthub/codeact_agent/function_calling.py`
- `openhands/memory/conversation_memory.py`

Repository-wide searches were also used to identify the boundaries for:

- controller and delegation behavior
- action and observation taxonomies
- memory and condensation behavior
- sandbox, tools, browser, and MCP boundaries

## 3. Interpreting the OpenHands Runtime Shape

## 3.1 Minimum Runnable Unit

From the legacy V0 OpenHands path, the minimum runnable unit can be reduced to:

1. `CodeActAgent` builds messages and tool specs from state
2. the LLM returns a function-calling style response
3. `function_calling.py` converts the response into OpenHands actions
4. the controller executes the action and emits an observation
5. memory and condensation logic prepare the next-step context

Inside the shared reference runtime, the naturally portable subset is:

- prompt construction
- action parsing
- lightweight history trimming / condensation compatibility
- tool schema and tool invocation boundaries

## 3.2 Main Sources of Complexity in Original OpenHands

OpenHands is materially more complex than the shared runtime in several ways:

- `AgentController` owns state transitions, pending actions, loop recovery, and stuck detection
- delegation uses parent and child controllers
- actions and observations are rich event types, not a single flattened pair
- `ConversationMemory` reconciles tool-call requests with tool responses
- condensation is an explicit event and memory-view workflow, not only token trimming
- sandbox execution is a distinct environment layer with browser, MCP, Jupyter, and remote execution support

Most of those capabilities do not map cleanly onto the current single-threaded linear runtime loop.

## 4. What Could Be Mapped and What Could Not

## 4.1 Capabilities That Map Well to the Shared Runtime

The following capabilities were identified as good fits for the shared runtime abstraction:

- `PromptBuilder`
- `ActionParser`
- `ContextStrategy`
- `ToolSpec`
- `finish` as a standard runtime termination action

These are the parts that were prioritized in this migration.

## 4.2 Capabilities That Do Not Currently Migrate Equivalently

The following capabilities were not migrated with full fidelity and were intentionally downgraded to compatibility shims or left out:

- multi-controller orchestration and delegation
- pending action queues
- loop recovery and stuck detection
- full event stream semantics
- tool call metadata reconciliation
- browser workflows
- MCP integration
- microagent memory and recall augmentation
- full condensation request and summary insertion semantics
- persistent interactive Jupyter state
- sandbox lifecycle management

## 5. What Was Implemented

## 5.1 New OpenHands Adapter Implementation

New directory added:

- `runtime/src/agents/openhands/`

New files added:

- `runtime/src/agents/openhands/index.ts`
- `runtime/src/agents/openhands/prompt.ts`
- `runtime/src/agents/openhands/parser.ts`
- `runtime/src/agents/openhands/context.ts`
- `runtime/src/agents/openhands/tools.ts`

These files implement the minimal OpenHands compatibility adapter.

## 5.2 PromptBuilder Mapping

Implemented in:

- `runtime/src/agents/openhands/prompt.ts`

The prompt builder now:

- emits English-only runtime prompt content
- explicitly states that the agent is running inside a shared linear runtime loop
- warns that delegation, browser sessions, MCP servers, and concurrent controllers are unavailable
- enforces a single JSON object response format
- includes task, tools, and current history in the final prompt

This is not a byte-for-byte reproduction of OpenHands prompts. It is a compatibility-focused prompt that preserves the CodeAct plus tool-calling interaction style.

## 5.3 ActionParser Mapping

Implemented in:

- `runtime/src/agents/openhands/parser.ts`

The parser currently supports:

- `{"tool":{"name":"...","arguments":{...}}}`
- top-level `{"name":"...","arguments":{...}}`
- normalization of OpenHands-style `finish.message` into runtime `finish.result`

This ensures OpenHands-specific response shapes are handled by an agent-specific parser instead of forcing the generic runtime parser to absorb those assumptions.

## 5.4 ContextStrategy Mapping

Implemented in:

- `runtime/src/agents/openhands/context.ts`

Current behavior:

- when token estimates exceed the configured limit, the strategy drops the oldest assistant/tool pairs
- recent action-observation pairs are preserved
- a condensed compatibility notice is inserted to acknowledge lost OpenHands history fidelity

This is a deliberately small compatibility layer. It does not attempt to reproduce:

- summary insertion offsets
- explicit forgotten event tracking
- recall injection
- tool-call pairing repairs from OpenHands memory

## 5.5 ToolSpec Mapping

Implemented in:

- `runtime/src/agents/openhands/tools.ts`

The minimal migrated tool set is:

- `execute_bash`
- `execute_ipython_cell`
- `str_replace_editor`
- `think`
- `request_condensation`

Behavior summary:

- `execute_bash`
  - preserves the core shell execution path used heavily by OpenHands
- `execute_ipython_cell`
  - provides a minimal compatibility layer through `python3 -c`
- `str_replace_editor`
  - supports a minimal command subset: `view`, `create`, `str_replace`, `insert`
- `think`
  - preserves a no-side-effect reasoning trace tool
- `request_condensation`
  - exists as a compatibility shim while real history reduction remains the job of the shared runtime context strategy

## 5.6 Package Export Bridge

Updated:

- `packages/agents/openhands/src/index.ts`

The package-side file now re-exports the runtime adapter implementation. In this iteration, the full implementation lives under `runtime/src/agents/openhands/`, while the package entry acts as a thin bridge.

Reasoning:

- the runtime registry currently consumes the implementation directly
- this iteration prioritized the smallest runnable adapter
- it avoided adding extra packaging or build indirection before the adapter shape stabilizes

If the repository later wants stricter physical placement under `packages/agents/openhands/`, the implementation can be moved in a follow-up refactor.

## 5.7 Minimal Runtime Registry Integration

Updated:

- `runtime/src/server/registry.ts`
- `runtime/src/server/schema.ts`

Completed integration work:

- registered the `openhands` prompt builder
- registered the `openhands` action parser
- registered the `openhands` context strategy
- registered the `openhands_minimal` tool preset
- updated the HTTP schema enums so the adapter can be selected at runtime

This followed the migration rule of doing only the minimum necessary registry wiring and leaving the core runtime loop untouched.

## 5.8 Minimal Tests

Added:

- `runtime/tests/openhands.test.ts`

Test coverage includes:

- parsing an OpenHands-style compatibility tool envelope
- normalizing `finish.message` into runtime finish args
- ensuring the prompt builder includes compatibility constraints
- verifying that the OpenHands context strategy performs minimal trimming

## 6. Known Fidelity Losses Relative to Original OpenHands

This migration intentionally lands a minimum runnable skeleton, so there are important fidelity gaps relative to original OpenHands.

## 6.1 Controller-Level Losses

Not migrated:

- `AgentController` state machine behavior
- initial state wiring
- status callbacks
- replay manager behavior
- stuck detector behavior
- loop recovery
- parent/delegate controller relationships
- pending action queue semantics

Impact:

- the adapter currently only works as a single-step action producer inside the shared linear loop
- complex OpenHands control flow is not preserved

## 6.2 Memory and Condensation Losses

Not migrated:

- `ConversationMemory` tool-call request / tool-response reconciliation
- dual-path condensation behavior with view generation vs condensation actions
- `forgotten_event_ids`
- recall and microagent knowledge injection
- provider-specific cache and message shaping details

Impact:

- the shared runtime now uses generic `ContextEntry[]` history
- prompt history is not guaranteed to match original OpenHands message construction
- condensation currently means trimming plus a compatibility notice, not full summarization workflow parity

## 6.3 Tool and Sandbox Losses

Not migrated or only stubbed:

- browser tools
- MCP tools
- remote runtime, docker runtime, kubernetes runtime, and local sandbox abstractions
- persistent IPython or notebook execution state
- security-risk handling and confirmation-mode behavior

Impact:

- the migrated adapter preserves only the smallest shell, Python, and file editing capabilities
- execution boundaries now look like the reference runtime, not like the original OpenHands sandbox system

## 7. Current Status Assessment

## 7.1 What Is Complete

This migration can be considered complete for the "minimum runnable skeleton" phase:

- OpenHands now has its own prompt/parser/context/tools adapter set
- the adapter can be selected through the shared runtime registry
- deterministic tests were added
- build and test validation passed

## 7.2 What Is Still Stubbed or Simplified

The following items still exist only as stubs or simplified compatibility layers:

- `request_condensation`
- persistent semantics of `execute_ipython_cell`
- full OpenHands ACI coverage for `str_replace_editor`
- OpenHands memory pairing and event serialization behavior

## 8. Validation Performed

The following validation steps were executed:

- `npm install`
- `npx tsc -p tsconfig.json --noEmit`
- `npm run build`
- `npm test`

Validation result:

- type checking passed
- build passed
- tests passed
- the newly added OpenHands tests and the pre-existing runtime tests all passed

## 9. Recommended Next Steps

If OpenHands migration continues, the recommended order is:

1. add fixture-based prompt/parser comparisons against source OpenHands behavior
2. expand `str_replace_editor` toward closer ACI semantic coverage
3. design a lightweight compatibility layer for tool-call pairing
4. explicitly decide whether browser and MCP should remain unsupported or gain shims
5. evaluate whether the implementation should later move fully under `packages/agents/openhands/`

## 10. Conclusion

This migration did not attempt to "move all of OpenHands over." Instead, it compressed the minimum runnable OpenHands core into a shared-runtime-compatible adapter and explicitly documented the losses.

The result of this iteration is:

- a registered, buildable, testable OpenHands compatibility skeleton inside `meta-agent-runtime`
- the four priority mapping points are now implemented: prompt, parser, context, and tools
- no other agent directories were modified
- the migration boundary is now much clearer for future incremental work
