from dataclasses import asdict, dataclass, field
from typing import Literal, Optional


@dataclass
class LLMConfig:
    provider: Literal["anthropic", "openai", "local"]
    model: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None


@dataclass
class ContextStrategyConfig:
    name: Literal["noop", "sliding_window", "summarization", "selective"] = "sliding_window"
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
    prompt_language: Literal["zh", "en"] = "zh"
    prompt_builder: Literal["react", "cot", "minimal", "smolagents", "swe_agent"] = "react"
    action_parser: Literal["json", "xml", "function_call", "react"] = "json"
    context_strategy: ContextStrategyConfig = field(default_factory=ContextStrategyConfig)
    tools: Literal["swe", "minimal", "custom"] = "swe"
    config: RuntimeConfig = field(default_factory=RuntimeConfig)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class StepSummary:
    step: int
    action_name: str
    action_args: dict
    observation_content: str
    observation_error: Optional[str]
    token_in: int
    token_out: int
    elapsed_ms: int


@dataclass
class RunResponse:
    success: bool
    result: str
    termination_reason: Literal["finish", "max_steps", "max_tokens", "budget_token", "budget_time", "error"]
    steps: list[StepSummary]
    total_token_in: int
    total_token_out: int
    total_elapsed_ms: int

    @classmethod
    def from_dict(cls, data: dict) -> "RunResponse":
        copied = dict(data)
        steps = [StepSummary(**item) for item in copied.pop("steps", [])]
        return cls(steps=steps, **copied)
