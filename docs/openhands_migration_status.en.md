# OpenHands Migration Status Report

## 1. Current Summary

The OpenHands migration has now reached the "minimum runnable and research-friendly" stage.

Current status:

- the main OpenHands adapter implementation now lives under `packages/agents/openhands/`
- the adapter exposes distinct `PromptBuilder`, `ActionParser`, `ContextStrategy`, and `ToolSpec` mappings
- minimal runtime registry integration is complete
- the adapter now has stronger source-aligned compatibility tests
- explicit compatibility losses are still documented instead of being disguised as full fidelity

## 2. Migration Boundary

This migration does not attempt to recreate all of OpenHands. It compresses the smallest runnable OpenHands unit into the boundaries that the shared linear runtime can support.

Constraints followed in this migration:

- agent-specific logic should stay inside `packages/agents/openhands/` whenever possible
- `runtime/` should stay agent-agnostic and only receive minimal registry wiring
- runtime prompts, tool descriptions, and interaction contracts remain English-only
- documentation remains split into separate Chinese and English files
- other agent migration directories should not be disturbed

## 3. Source Review Scope

The following OpenHands V0 files were used as the main source of truth during migration and later correction:

- `openhands/agenthub/codeact_agent/codeact_agent.py`
- `openhands/agenthub/codeact_agent/function_calling.py`
- `openhands/agenthub/codeact_agent/tools/bash.py`
- `openhands/agenthub/codeact_agent/tools/ipython.py`
- `openhands/agenthub/codeact_agent/tools/str_replace_editor.py`
- `openhands/agenthub/codeact_agent/tools/finish.py`
- `openhands/agenthub/codeact_agent/tools/condensation_request.py`
- `openhands/controller/agent_controller.py`
- `openhands/memory/conversation_memory.py`
- `openhands/events/observation/*.py`

The main boundaries reviewed were:

- controller / pending action / delegation behavior
- function-calling action envelopes
- memory / condensation / pairing behavior
- shell / ipython / editor / sandbox / browser / MCP behavior

## 4. Current Implementation Location

The main OpenHands adapter implementation now lives in:

- `packages/agents/openhands/src/adapter.ts`
- `packages/agents/openhands/src/prompt.ts`
- `packages/agents/openhands/src/parser.ts`
- `packages/agents/openhands/src/context.ts`
- `packages/agents/openhands/src/tools.ts`
- `packages/agents/openhands/src/index.ts`

This is no longer the older `runtime/src/agents/openhands/` layout.

## 5. Capabilities Already Migrated

### 5.1 PromptBuilder

Implemented in:

- `packages/agents/openhands/src/prompt.ts`

Currently aligned behavior:

- preserves a minimal OpenHands CodeAct-style compatibility prompt
- makes the shared linear runtime loop explicit
- explicitly warns that delegation, browser, MCP, event replay, and concurrent controllers are unavailable
- explains that `execute_bash` is a persistent shell cwd compatibility layer
- explains that `execute_ipython_cell` is a replay-based persistent cell compatibility layer
- explicitly requires `security_risk`
- explicitly requires absolute paths for the editor and documents `undo_edit`
- enforces a single JSON tool-call response contract

### 5.2 ActionParser

Implemented in:

- `packages/agents/openhands/src/parser.ts`

Currently supported:

- `{"tool":{"name":"...","arguments":{...}}}`
- top-level `{"name":"...","arguments":{...}}`
- function-calling style `tool_calls[0].function.{name, arguments}`
- normalization from `finish.message` into runtime `finish.result`

### 5.3 ContextStrategy

Implemented in:

- `packages/agents/openhands/src/context.ts`

Current behavior:

- trims the oldest assistant/tool pairs first when over budget
- inserts a condensed compatibility notice
- avoids stacking multiple condensed prefixes
- returns a fresh context object to preserve the shared runtime contract

### 5.4 ToolSpec Mapping

Implemented in:

- `packages/agents/openhands/src/tools.ts`

Current minimal tool set:

- `execute_bash`
- `execute_ipython_cell`
- `str_replace_editor`
- `think`
- `request_condensation`

Current behavior:

- `execute_bash`
  - supports `command / is_input / timeout / security_risk`
  - now preserves minimal persistent shell cwd behavior
  - `is_input=true` is still an explicit compatibility loss
- `execute_ipython_cell`
  - supports `code / timeout / security_risk`
  - approximates persistent Python state by replaying successful cells
- `str_replace_editor`
  - supports `view / create / str_replace / insert / undo_edit`
  - requires absolute paths
  - prevents overwrite on `create`
  - requires unique exact matches for `str_replace`
  - supports directory viewing and numbered file views
- `think`
  - preserved as a no-side-effect reasoning trace tool
- `request_condensation`
  - keeps the OpenHands-compatible name while real condensation remains the job of the shared runtime context strategy

### 5.5 Research-Friendly Component Split

To make future ablation work easier, the tool layer now exposes finer-grained factories:

- `createOpenHandsBashTool()`
- `createOpenHandsIPythonTool()`
- `createOpenHandsEditorTool()`
- `createOpenHandsThinkTool()`
- `createOpenHandsCondensationTool()`
- `createOpenHandsTools()`

This allows future experiments to swap only one OpenHands tool mapping instead of replacing the entire tool preset as a single opaque bundle.

## 6. Fidelity Losses Relative to Original OpenHands

### 6.1 Controller-Level Losses

Not migrated:

- `AgentController` state machine behavior
- pending action queues
- stuck detection / loop recovery
- parent / delegate controllers
- replay manager
- status callbacks

### 6.2 Memory / Condensation Losses

Not migrated:

- `ConversationMemory` pairing between assistant tool calls and tool responses
- dual-path condensation action vs. memory view behavior
- `forgotten_event_ids`
- recall / microagent knowledge
- provider-specific message formatting

### 6.3 Sandbox / Tooling Losses

Not migrated or still shimmed:

- browser tooling
- MCP tools
- security analyzer / confirmation mode
- remote runtime / docker / kubernetes / local sandbox abstractions
- a true persistent Jupyter kernel
- bash stdin continuation for long-running processes

## 7. Parts Still Considered Stub or TODO

The following areas still remain stubs or simplified compatibility layers:

- the real `request_condensation` behavior
- a more faithful persistent interpreter for `execute_ipython_cell`
- fuller OpenHands ACI coverage for `str_replace_editor`
- OpenHands memory pairing / event serialization semantics
- browser / MCP / task-tracker / security analyzer alignment

## 8. Important Corrections Made in the Latest Pass

The latest correction pass fixed several "runnable but not faithful enough" deviations:

- `execute_bash` moved from one-shot shell execution to a minimal persistent cwd shell compatibility layer
- `execute_ipython_cell` moved from one-shot `python3 -c` execution to successful-cell replay
- `str_replace_editor` gained `undo_edit`, absolute-path requirements, unique replacement rules, directory view, and create-without-overwrite behavior
- the parser gained function-calling envelope support
- the prompt now documents `security_risk`, editor discipline, and condensation usage more explicitly
- tool factories were split into individually exportable research units
- tool preset state is now isolated per run, so different runs do not leak bash/python/editor state into each other

## 9. Validation Performed

Validation performed in the latest update:

- `node --import tsx --test tests/openhands.test.ts`
- a targeted script to verify persistent cwd behavior for `execute_bash`
- a targeted script to verify `create / view / undo_edit` behavior for `str_replace_editor`

Current result:

- OpenHands source-level tests passed
- targeted shell and editor compatibility checks passed

Important note:

- repository-wide `npm run build` can still be blocked by unrelated existing issues in other agent directories; this is not an OpenHands regression from this update

## 10. Recommended Next Steps

If OpenHands migration continues, the recommended next order is:

1. add fixture-based prompt/parser comparisons against source OpenHands behavior
2. continue extending `str_replace_editor` toward fuller OpenHands ACI semantics
3. design a compatibility layer for tool-call pairing
4. decide whether browser and MCP should remain out of scope or get shimmed
5. add more fine-grained ablation fixtures around the individually exported tool factories

## 11. Final Status

The current OpenHands migration status can be summarized as:

**"The minimum runnable skeleton is complete and now structured for modular research, but it is still not a full high-fidelity recreation of the original OpenHands controller/runtime algorithm."**
