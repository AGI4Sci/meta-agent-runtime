from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

from tqdm import tqdm

# Resolve eval/ package: parents[2] = meta-agent-runtime/, then /eval
_EVAL_DIR = Path(__file__).resolve().parents[2] / "eval"
if str(_EVAL_DIR) not in sys.path:
    sys.path.insert(0, str(_EVAL_DIR))

from agent_runtime_client import AgentRuntimeClient, LLMConfig, RunRequest, RuntimeConfig
from agent_runtime_client.types import ContextStrategyConfig, RegistryResponse

from config import BenchmarkConfig
from predictions import load_predictions, save_prediction

SELECTED_INSTANCES_FILENAME = "selected_instances.json"
RUNTIME_REGISTRY_FILENAME = "runtime_registry.json"
RUN_CONFIG_FILENAME = "resolved_run_config.json"
INSTANCE_LOGS_DIRNAME = "instance_logs"
WORKSPACES_DIRNAME = "workspaces"
REPO_CACHE_DIRNAME = "repos"

# Task prompt template — explicitly instructs the agent to output a git diff
SWE_TASK_TEMPLATE = """\
You are working on a GitHub repository to fix a reported issue.

Repository: {repo}
Base commit: {base_commit}
Workspace root: {workspace_root}

Issue description:
{problem_statement}

Your goal:
1. Understand the issue by reading the relevant source files in the repository.
2. Make the minimal code change needed to fix the issue.
3. Verify your fix does not break existing tests.
4. When complete, call finish with the result set to the full unified diff \
(output of `git diff`) of all your changes.

Use the provided workspace root as the real checkout on disk.
For bash/search tools, set cwd to the workspace root or its subdirectories.
For file tools, use paths inside the workspace root.
The diff must be applicable with: git apply --verbose
Do not include test files in your patch unless the issue explicitly requires it.
Do not wrap the diff in Markdown fences.
"""


def format_task(instance: dict, workspace_root: Path) -> str:
    return SWE_TASK_TEMPLATE.format(
        repo=instance["repo"],
        base_commit=instance["base_commit"],
        workspace_root=str(workspace_root),
        problem_statement=instance["problem_statement"],
    )


def run_git(args: list[str], cwd: Path | None = None) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=str(cwd) if cwd is not None else None,
        check=True,
        text=True,
        capture_output=True,
    )
    return completed.stdout.strip()


def ensure_repo_cache(repo_cache_dir: Path, repo: str) -> Path:
    repo_cache_dir.mkdir(parents=True, exist_ok=True)
    repo_slug = repo.replace("/", "__")
    repo_dir = repo_cache_dir / repo_slug
    remote_url = f"https://github.com/{repo}.git"

    if not repo_dir.exists():
      run_git(["clone", "--mirror", remote_url, str(repo_dir)])
    else:
      run_git(["remote", "update", "--prune"], cwd=repo_dir)

    return repo_dir


def ensure_commit_available(repo_dir: Path, base_commit: str) -> None:
    try:
        run_git(["rev-parse", "--verify", f"{base_commit}^{{commit}}"], cwd=repo_dir)
    except subprocess.CalledProcessError:
        run_git(["fetch", "origin", base_commit], cwd=repo_dir)
        run_git(["rev-parse", "--verify", f"{base_commit}^{{commit}}"], cwd=repo_dir)


def prepare_instance_workspace(config: BenchmarkConfig, instance: dict) -> Path:
    repo_cache_dir = config.workspace_cache_dir / REPO_CACHE_DIRNAME
    workspace_dir = config.workspace_cache_dir / WORKSPACES_DIRNAME / instance["instance_id"]
    repo_dir = ensure_repo_cache(repo_cache_dir, instance["repo"])
    ensure_commit_available(repo_dir, instance["base_commit"])

    workspace_dir.parent.mkdir(parents=True, exist_ok=True)
    if workspace_dir.exists():
        shutil.rmtree(workspace_dir)

    run_git(["clone", str(repo_dir), str(workspace_dir)])
    run_git(["checkout", instance["base_commit"]], cwd=workspace_dir)
    run_git(["clean", "-fdx"], cwd=workspace_dir)
    return workspace_dir


def load_local_dataset(path: Path) -> list[dict]:
    text = path.read_text().strip()
    if not text:
        return []
    if path.suffix.lower() == ".json":
        data = json.loads(text)
        if not isinstance(data, list):
            raise ValueError("--dataset-path JSON must contain a list of objects")
        instances = data
    else:
        instances = [json.loads(line) for line in text.splitlines() if line.strip()]

    required = {"instance_id", "repo", "base_commit", "problem_statement"}
    normalized: list[dict] = []
    for index, instance in enumerate(instances, start=1):
        if not isinstance(instance, dict):
            raise ValueError(f"--dataset-path item #{index} must be a JSON object")
        missing = sorted(required.difference(instance.keys()))
        if missing:
            raise ValueError(
                f"--dataset-path item #{index} is missing required fields: {', '.join(missing)}"
            )
        normalized.append(instance)
    return normalized


def load_dataset_instances(config: BenchmarkConfig) -> list[dict]:
    if config.dataset_path is not None:
        instances = load_local_dataset(config.dataset_path)
    else:
        try:
            from datasets import load_dataset
        except ImportError as exc:
            raise ImportError(
                "The 'datasets' package is required unless --dataset-path is provided. "
                "Install with: pip install datasets"
            ) from exc

        dataset = load_dataset(config.dataset_name, split=config.split)
        instances = list(dataset)

    if config.instance_ids:
        id_set = set(config.instance_ids)
        instances = [i for i in instances if i["instance_id"] in id_set]

    if config.max_instances is not None:
        instances = instances[: config.max_instances]

    return instances


def ensure_runtime_compatible(config: BenchmarkConfig, registry: RegistryResponse) -> None:
    if config.prompt_builder not in registry["prompt_builders"]:
        raise ValueError(
            f"Unsupported prompt builder '{config.prompt_builder}'. "
            f"Runtime supports: {', '.join(registry['prompt_builders'])}"
        )
    if config.action_parser not in registry["action_parsers"]:
        raise ValueError(
            f"Unsupported action parser '{config.action_parser}'. "
            f"Runtime supports: {', '.join(registry['action_parsers'])}"
        )
    if config.context_strategy not in registry["context_strategies"]:
        raise ValueError(
            f"Unsupported context strategy '{config.context_strategy}'. "
            f"Runtime supports: {', '.join(registry['context_strategies'])}"
        )

    if config.tools != "custom" and config.tools not in registry["tools"]:
        raise ValueError(
            f"Unsupported tool preset '{config.tools}'. "
            f"Runtime supports: {', '.join(registry['tools'])}"
        )

    if config.tools == "custom" and not config.runtime_tools_preset:
        raise ValueError(
            'tools="custom" requires --runtime-tools-preset so the server-side '
            "RUNTIME_TOOLS_PRESET is explicit and reproducible."
        )


def write_run_metadata(
    config: BenchmarkConfig,
    registry: RegistryResponse,
    instances: list[dict],
) -> None:
    config.output_dir.mkdir(parents=True, exist_ok=True)
    (config.output_dir / RUNTIME_REGISTRY_FILENAME).write_text(
        json.dumps(registry, indent=2)
    )
    (config.output_dir / SELECTED_INSTANCES_FILENAME).write_text(
        json.dumps(instances, indent=2)
    )
    (config.output_dir / RUN_CONFIG_FILENAME).write_text(
        json.dumps(
            {
                "run_id": config.run_id,
                "dataset_name": config.dataset_name,
                "dataset_path": str(config.dataset_path) if config.dataset_path is not None else None,
                "split": config.split,
                "instance_ids_file": (
                    str(config.instance_ids_file) if config.instance_ids_file is not None else None
                ),
                "workspace_cache_dir": str(config.workspace_cache_dir),
                "runtime_url": config.runtime_url,
                "prompt_builder": config.prompt_builder,
                "action_parser": config.action_parser,
                "context_strategy": config.context_strategy,
                "context_max_tokens": config.context_max_tokens,
                "tools": config.tools,
                "runtime_tools_preset": config.runtime_tools_preset,
                "provider": config.provider,
                "model": config.model,
                "base_url": config.base_url,
                "max_steps": config.max_steps,
                "budget_token": config.budget_token,
                "budget_time_ms": config.budget_time_ms,
            },
            indent=2,
        )
    )


def normalize_patch(raw_result: str) -> str:
    text = (raw_result or "").strip()
    if not text:
        return ""

    fenced_match = re.search(r"```(?:diff|patch)?\s*\n(.*?)```", text, re.DOTALL)
    if fenced_match:
        text = fenced_match.group(1).strip()

    diff_start_markers = ("\ndiff --git ", "\n--- ", "\nIndex: ")
    start_positions = [text.find(marker.lstrip("\n")) for marker in ("diff --git ", "--- ", "Index: ")]
    start_positions = [pos for pos in start_positions if pos >= 0]
    if start_positions:
        text = text[min(start_positions):].strip()

    if not looks_like_patch(text):
        return ""
    return text


def looks_like_patch(text: str) -> bool:
    if not text:
        return False
    if "diff --git " in text:
        return True
    has_old = re.search(r"^---\s", text, re.MULTILINE) is not None
    has_new = re.search(r"^\+\+\+\s", text, re.MULTILINE) is not None
    has_hunk = re.search(r"^@@\s", text, re.MULTILINE) is not None
    return has_old and has_new and has_hunk


def write_instance_log(
    output_dir: Path,
    instance_id: str,
    response: Optional[object],
    patch: str,
    error: Optional[str] = None,
) -> None:
    log_dir = output_dir / INSTANCE_LOGS_DIRNAME
    log_dir.mkdir(parents=True, exist_ok=True)

    payload = {
        "instance_id": instance_id,
        "error": error,
        "patch_length": len(patch),
    }

    if response is not None:
        payload.update(
            {
                "success": response.success,
                "termination_reason": response.termination_reason,
                "result_preview": response.result[:2000],
                "total_token_in": response.total_token_in,
                "total_token_out": response.total_token_out,
                "total_elapsed_ms": response.total_elapsed_ms,
                "steps": [
                    {
                        "step": step.step,
                        "action_name": step.action_name,
                        "action_args": step.action_args,
                        "observation_content_preview": step.observation_content[:1000],
                        "observation_error": step.observation_error,
                        "token_in": step.token_in,
                        "token_out": step.token_out,
                        "elapsed_ms": step.elapsed_ms,
                    }
                    for step in response.steps
                ],
            }
        )

    (log_dir / f"{instance_id}.json").write_text(json.dumps(payload, indent=2))


def run_benchmark(config: BenchmarkConfig) -> dict[str, dict]:
    """Run all instances and save predictions incrementally.

    Returns the full predictions dict (instance_id -> prediction record).
    """
    config.output_dir.mkdir(parents=True, exist_ok=True)
    instances = load_dataset_instances(config)

    existing = load_predictions(config.output_dir) if config.resume else {}
    pending = [i for i in instances if i["instance_id"] not in existing]

    print(
        f"Instances: total={len(instances)}, "
        f"completed={len(existing)}, pending={len(pending)}"
    )

    if config.tools == "custom":
        print(
            "[INFO] Using tools=custom. Ensure the runtime server process was started "
            f"with RUNTIME_TOOLS_PRESET={config.runtime_tools_preset!r}."
        )

    if not pending:
        print("All instances already completed. Use --no-resume to re-run.")
        return existing

    model_name = f"{config.provider}/{config.model}"

    if config.budget_time_ms:
        client_timeout = config.budget_time_ms / 1000.0 + 60.0
    else:
        client_timeout = 960.0

    completed = dict(existing)

    with AgentRuntimeClient(
        base_url=config.runtime_url, timeout=client_timeout
    ) as client:
        registry = client.registry()
        ensure_runtime_compatible(config, registry)
        write_run_metadata(config, registry, instances)

        for instance in tqdm(pending, desc="Running instances"):
            instance_id = instance["instance_id"]
            workspace_root = prepare_instance_workspace(config, instance)
            task = format_task(instance, workspace_root)

            request = RunRequest(
                task=task,
                llm=LLMConfig(
                    provider=config.provider,
                    model=config.model,
                    api_key=config.api_key,
                    base_url=config.base_url,
                ),
                prompt_builder=config.prompt_builder,
                action_parser=config.action_parser,
                context_strategy=ContextStrategyConfig(
                    name=config.context_strategy,
                    max_tokens=config.context_max_tokens,
                ),
                tools=config.tools,
                config=RuntimeConfig(
                    max_steps=config.max_steps,
                    budget_token=config.budget_token,
                    budget_time_ms=config.budget_time_ms,
                    workspace_root=str(workspace_root),
                ),
            )

            patch = ""
            response = None
            error = None

            try:
                response = client.run(request)
            except Exception as exc:
                error = str(exc)
                print(f"\n[WARN] {instance_id}: runtime error: {exc}")
            else:
                if response.termination_reason == "finish":
                    patch = normalize_patch(response.result)
                    if not patch:
                        print(
                            f"\n[INFO] {instance_id}: finish returned a non-patch result; "
                            "saved as empty patch so the harness can skip it safely"
                        )
                else:
                    print(
                        f"\n[INFO] {instance_id}: terminated with "
                        f"'{response.termination_reason}', no patch saved"
                    )

            write_instance_log(config.output_dir, instance_id, response, patch, error)
            save_prediction(config.output_dir, instance_id, model_name, patch)
            completed[instance_id] = {
                "instance_id": instance_id,
                "model_name_or_path": model_name,
                "model_patch": patch,
            }

    return completed
