"""Export the manual controller and parity cases; never train or finalise anything."""
from dataclasses import asdict
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))
from task2.config import load_task2_config
from task2.flc import MamdaniFLC
from task2.safety import safe_control


def export():
    parameters = load_task2_config(ROOT / "configs/task2.yaml").flc
    controller = MamdaniFLC(parameters)
    config = {
        "universes": {name: getattr(parameters, f"{name}_universe") for name in ("error", "outdoor", "output")},
        "sets": {name: [asdict(item) for item in getattr(parameters, f"{name}_sets")] for name in ("error", "outdoor", "output")},
        "rule_table": parameters.rule_table,
        "output_grid_points": parameters.output_grid_points,
        "provenance": {
            "label": "Original manual Mamdani controller",
            "source": "configs/task2.yaml",
            "source_sha256": hashlib.sha256((ROOT / "configs/task2.yaml").read_bytes()).hexdigest(),
            "method": "Minimum implication, maximum aggregation, trapezoidal centroid on 201 output points",
            "note": "Live demonstration uses manual parameters, not the GA-tuned controller. Commands are percentages; positive heats and negative cools. No room physics is simulated.",
        },
    }
    cases = []
    inputs = [
        {"error": error, "outdoor": outdoor, "manualOverride": None}
        for error in [-20, -8, -7.5, -4.5, -4, -3.5, -3, -0.1, 0, 0.1, 2.25, 3, 3.5, 4, 4.5, 7.5, 8, 20]
        for outdoor in [-50, -10, -5, 0, 7.25, 10, 15, 20, 25, 35, 40, 60]
    ]
    inputs += [{"error": None, "outdoor": None, "manualOverride": value} for value in [-200, -100, -12.3, 0, 76.4, 100, 200, "bad", True]]
    inputs += [{"error": value, "outdoor": 15, "manualOverride": None} for value in [None, "2", False]]
    inputs += [{"error": 0, "outdoor": value, "manualOverride": None} for value in [None, "15", True]]
    for item in inputs:
        result = safe_control(controller, item["error"], item["outdoor"], item["manualOverride"])
        expected = {"command": result.command, "status": result.status.value, "clipped": result.clipped}
        if result.explanation is not None:
            expected["activeRules"] = [{"index": rule.index, "errorSet": rule.error_set, "outdoorSet": rule.outdoor_set, "outputSet": rule.consequent, "strength": rule.strength} for rule in result.explanation.rule_activations if rule.strength > 0]
            expected["aggregatedMembership"] = result.explanation.aggregated_membership.tolist()
        cases.append({"input": item, "expected": expected})
    for relative, data in [("data/controller.json", config), ("tests/fixtures/controller-cases.json", cases)]:
        path = ROOT / "website" / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"Exported manual controller and {len(cases)} Python safe_control parity cases.")


if __name__ == "__main__":
    export()
