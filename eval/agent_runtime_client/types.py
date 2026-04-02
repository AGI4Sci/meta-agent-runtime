from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal, Optional, TypedDict


PromptBuilderName = Literal["react", "cot", "minimal", "smolagents", "swe_agent"]
ActionParserName = Literal["json", "xml", "function_call", "react"]
ContextStrategyName = Literal["noop", "sliding_window", "summarization", "selective"]
ToolPresetName = Literal["swe", "minimal", "custom"]
TerminationReason = Literal["finish", "max_steps", "max_tokens", "budget_token", "budget_time", "error"]


class RegistryResponse(TypedDict):
    prompt_builders: list[str]
    action_parsers: list[str]
    context_strategies: list[str]
    tools: list[str]


@dataclass
class LLMConfig:
    provider: Literal["anthropic", "openai", "local"]
    model: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None


@dataclass
class ContextStrategyConfig:
    name: ContextStrategyName = "sliding_window"
    max_tokens: Optional[int] = 8000


@dataclass
class RuntimeConfig:
    max_steps: int = 50
    max_tokens: int = 100_000
    budget_token: Optional[int] = None
    budget_time_ms: Optional[int] = None


@dataclass
class RunRequest:
    task: str
    llm: LLMConfig
    prompt_builder: PromptBuilderName = "react"
    action_parser: ActionParserName = "json"
    context_strategy: ContextStrategyConfig = field(default_factory=ContextStrategyConfig)
    tools: ToolPresetName = "swe"
    config: RuntimeConfig = field(default_factory=RuntimeConfig)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class StepSummary:
    step: int
    action_name: str
    action_args: dict[str, Any]
    observation_content: str
    observation_error: Optional[str]
    token_in: int
    token_out: int
    elapsed_ms: int


@dataclass
class RunResponse:
    success: bool
    result: str
    termination_reason: TerminationReason
    steps: list[StepSummary]
    total_token_in: int
    total_token_out: int
    total_elapsed_ms: int

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RunResponse":
        if not isinstance(data, dict):
            raise ValueError("RunResponse payload must be a dict")
        payload = dict(data)
        raw_steps = payload.pop("steps", [])
        if not isinstance(raw_steps, list):
            raise ValueError("RunResponse.steps must be a list")
        steps: list[StepSummary] = []
        for step in raw_steps:
            if not isinstance(step, dict):
                raise ValueError("Each RunResponse step must be a dict")
            steps.append(StepSummary(**step))
        return cls(steps=steps, **payload)


def validate_registry_payload(data: dict[str, Any]) -> RegistryResponse:
    required = ("prompt_builders", "action_parsers", "context_strategies", "tools")
    for key in required:
        value = data.get(key)
        if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
            raise ValueError(f"Registry field '{key}' must be a list[str]")
    return RegistryResponse(
        prompt_builders=list(data["prompt_builders"]),
        action_parsers=list(data["action_parsers"]),
        context_strategies=list(data["context_strategies"]),
        tools=list(data["tools"]),
    )
