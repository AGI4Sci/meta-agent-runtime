from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Optional

SWEBENCH_VERIFIED_DATASET = "SWE-bench/SWE-bench_Verified"
SWEBENCH_SPLIT = "test"
DEFAULT_INSTANCE_IDS_FILE = Path(__file__).resolve().parent / "datasets" / "verified_smoke.txt"
DEFAULT_WORKSPACE_CACHE_DIR = Path(__file__).resolve().parent / "workspace_cache"
DEFAULT_MODEL = "claude-sonnet-4-6"
DEFAULT_PROVIDER = "anthropic"
DEFAULT_PROMPT_BUILDER = "swe_agent"
DEFAULT_ACTION_PARSER = "json"
DEFAULT_MAX_STEPS = 50
DEFAULT_BUDGET_TOKEN = 150_000
DEFAULT_TIMEOUT_S = 960.0


@dataclass
class BenchmarkConfig:
    # Output
    output_dir: Path = Path("./benchmark_runs")
    run_id: str = ""  # auto-set to timestamp if empty

    # Dataset
    dataset_name: str = SWEBENCH_VERIFIED_DATASET
    dataset_path: Optional[Path] = None
    split: str = SWEBENCH_SPLIT
    instance_ids: list[str] = field(default_factory=list)  # empty = all
    instance_ids_file: Optional[Path] = None
    max_instances: Optional[int] = None
    workspace_cache_dir: Path = DEFAULT_WORKSPACE_CACHE_DIR

    # Runtime targeting
    runtime_url: str = "http://localhost:3282"
    prompt_builder: str = DEFAULT_PROMPT_BUILDER
    action_parser: str = DEFAULT_ACTION_PARSER
    tools: str = "swe"
    context_strategy: str = "sliding_window"
    context_max_tokens: int = 8000
    runtime_tools_preset: Optional[str] = None

    # LLM
    provider: Literal["anthropic", "openai", "local"] = DEFAULT_PROVIDER
    model: str = DEFAULT_MODEL
    api_key: Optional[str] = None
    base_url: Optional[str] = None

    # Budget / stopping
    max_steps: int = DEFAULT_MAX_STEPS
    budget_token: Optional[int] = DEFAULT_BUDGET_TOKEN
    budget_time_ms: Optional[int] = None

    # Evaluation
    skip_evaluation: bool = False
    harness_max_workers: int = 4
    harness_timeout: int = 1800  # seconds per instance in Docker

    # Misc
    resume: bool = True  # skip instances already present in predictions file
