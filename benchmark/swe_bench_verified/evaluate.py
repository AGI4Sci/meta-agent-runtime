from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from config import BenchmarkConfig
from predictions import predictions_to_json

HARNESS_MODULE = "swebench.harness.run_evaluation"
DEFAULT_LOG_REPORT = "report.json"
DEFAULT_RUN_EVALUATION_LOG_DIR = Path("logs/run_evaluation")
VENDORED_SWEBENCH_DIR = Path(__file__).resolve().parent / "third_party" / "swebench"


def harness_pythonpath() -> str:
    paths = [str(VENDORED_SWEBENCH_DIR)]
    existing = os.environ.get("PYTHONPATH")
    if existing:
        paths.append(existing)
    return os.pathsep.join(paths)


def harness_entrypoint() -> str:
    return (
        "import runpy, sys; "
        f"sys.path.insert(0, {str(VENDORED_SWEBENCH_DIR)!r}); "
        f"runpy.run_module({HARNESS_MODULE!r}, run_name='__main__')"
    )


def invoke_harness(config: BenchmarkConfig) -> Path:
    """Convert predictions to JSON and invoke the SWE-bench evaluation harness.

    Runs as a subprocess so that:
    - The harness's relative-path log directories land under config.output_dir
      (achieved by setting cwd).
    - The harness's resource.setrlimit calls are isolated from this process.

    Returns the harness log directory path.
    """
    predictions_json = predictions_to_json(config.output_dir).resolve()
    output_dir = config.output_dir.resolve()

    cmd = [
        sys.executable,
        "-c",
        harness_entrypoint(),
        "--dataset_name",
        config.dataset_name,
        "--split",
        config.split,
        "--predictions_path",
        str(predictions_json),
        "--run_id",
        config.run_id,
        "--max_workers",
        str(config.harness_max_workers),
        "--timeout",
        str(config.harness_timeout),
        "--cache_level",
        "env",
    ]

    print(f"\nInvoking SWE-bench harness:\n  {' '.join(cmd)}\n")
    env = dict(os.environ)
    env["PYTHONPATH"] = harness_pythonpath()
    subprocess.run(cmd, cwd=str(output_dir), check=True, env=env)

    log_dir = output_dir / "logs" / "run_evaluation" / config.run_id
    return log_dir


def collect_report(config: BenchmarkConfig) -> dict:
    """Aggregate per-instance report.json files into a summary dict.

    Report.json path (from swebench harness constants):
      logs/run_evaluation/<run_id>/<model.replace("/","__")>/<instance_id>/report.json

    Returns:
      {
        "run_id": str,
        "model": str,
        "total_evaluated": int,
        "resolved": int,
        "unresolved": int,
        "empty_patch": int,
        "resolution_rate": float,
        "per_instance": { instance_id: {"resolved": bool, ...} }
      }
    """
    try:
        from swebench.harness.constants import LOG_REPORT, RUN_EVALUATION_LOG_DIR
    except ModuleNotFoundError:
        if str(VENDORED_SWEBENCH_DIR) not in sys.path:
            sys.path.insert(0, str(VENDORED_SWEBENCH_DIR))
        try:
            from swebench.harness.constants import LOG_REPORT, RUN_EVALUATION_LOG_DIR
        except ModuleNotFoundError:
            LOG_REPORT = DEFAULT_LOG_REPORT
            RUN_EVALUATION_LOG_DIR = DEFAULT_RUN_EVALUATION_LOG_DIR

    model_slug = f"{config.provider}/{config.model}".replace("/", "__")
    log_dir = config.output_dir / RUN_EVALUATION_LOG_DIR / config.run_id / model_slug

    per_instance: dict[str, dict] = {}
    if log_dir.exists():
        for report_path in sorted(log_dir.rglob(LOG_REPORT)):
            instance_id = report_path.parent.name
            try:
                data = json.loads(report_path.read_text())
                per_instance[instance_id] = data.get(instance_id, {})
            except (json.JSONDecodeError, OSError):
                per_instance[instance_id] = {}

    resolved = sum(1 for v in per_instance.values() if v.get("resolved", False))
    total = len(per_instance)
    empty = sum(
        1 for v in per_instance.values() if not v.get("patch_exists", True)
    )

    return {
        "run_id": config.run_id,
        "model": f"{config.provider}/{config.model}",
        "total_evaluated": total,
        "resolved": resolved,
        "unresolved": total - resolved,
        "empty_patch": empty,
        "resolution_rate": resolved / total if total else 0.0,
        "per_instance": per_instance,
    }


def print_summary(report: dict) -> None:
    print("\n=== SWE-bench Verified Results ===")
    print(f"Run ID         : {report['run_id']}")
    print(f"Model          : {report['model']}")
    print(f"Total evaluated: {report['total_evaluated']}")
    print(f"Resolved       : {report['resolved']} ({report['resolution_rate']:.1%})")
    print(f"Unresolved     : {report['unresolved']}")
    print(f"Empty patch    : {report['empty_patch']}")
    print("==================================")
