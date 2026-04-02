from __future__ import annotations

from pathlib import Path

try:
    from agent_runtime_client import AgentRuntimeClient, LLMConfig, RunRequest, RuntimeConfig
    from agent_runtime_client.types import PromptBuilderName
except ModuleNotFoundError:  # pragma: no cover - script entry fallback
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from agent_runtime_client import AgentRuntimeClient, LLMConfig, RunRequest, RuntimeConfig
    from agent_runtime_client.types import PromptBuilderName


def load_swebench_dataset(split: str):
    try:
        from datasets import load_dataset
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise ImportError("datasets is required to run SWE-bench experiments") from exc

    return load_dataset("princeton-nlp/SWE-bench_Verified", split=split)


def run_swebench(
    split: str = "verified",
    prompt_builder: PromptBuilderName = "react",
    max_tasks: int | None = None,
    budget_token: int = 100_000,
):
    dataset = load_swebench_dataset(split)
    if max_tasks is not None:
        dataset = dataset.select(range(max_tasks))

    with AgentRuntimeClient(timeout=900.0) as client:
        for task in dataset:
            result = client.run(
                RunRequest(
                    task=task["problem_statement"],
                    llm=LLMConfig(provider="anthropic", model="claude-opus-4-5"),
                    prompt_builder=prompt_builder,
                    config=RuntimeConfig(budget_token=budget_token),
                )
            )
            yield task["instance_id"], result
