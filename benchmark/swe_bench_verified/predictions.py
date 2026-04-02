from __future__ import annotations

import json
from pathlib import Path

PREDICTIONS_FILENAME = "predictions.jsonl"
PREDICTIONS_JSON_FILENAME = "predictions.json"

# Canonical SWE-bench harness keys
KEY_INSTANCE_ID = "instance_id"
KEY_MODEL = "model_name_or_path"
KEY_PREDICTION = "model_patch"


def load_predictions(output_dir: Path) -> dict[str, dict]:
    """Load existing predictions from disk, keyed by instance_id.

    Returns an empty dict if the predictions file does not exist.
    Used by runner.py to implement resume logic.
    """
    path = output_dir / PREDICTIONS_FILENAME
    if not path.exists():
        return {}
    predictions: dict[str, dict] = {}
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            predictions[record[KEY_INSTANCE_ID]] = record
    return predictions


def save_prediction(
    output_dir: Path,
    instance_id: str,
    model_name_or_path: str,
    model_patch: str,
) -> None:
    """Append one prediction to predictions.jsonl.

    model_patch may be an empty string when the agent failed to produce a patch;
    the SWE-bench harness skips empty-patch instances rather than erroring.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    record = {
        KEY_INSTANCE_ID: instance_id,
        KEY_MODEL: model_name_or_path,
        KEY_PREDICTION: model_patch,
    }
    with (output_dir / PREDICTIONS_FILENAME).open("a") as f:
        f.write(json.dumps(record) + "\n")


def predictions_to_json(output_dir: Path) -> Path:
    """Convert predictions.jsonl to predictions.json (list format).

    The SWE-bench harness accepts both formats; the JSON list is used for
    the --predictions_path argument when invoking the harness.
    Returns the path to the written JSON file.
    """
    predictions = list(load_predictions(output_dir).values())
    out_path = output_dir / PREDICTIONS_JSON_FILENAME
    out_path.write_text(json.dumps(predictions, indent=2))
    return out_path
