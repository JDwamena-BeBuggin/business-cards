from __future__ import annotations

import json
import sys
from pathlib import Path


def _dedupe_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        cleaned = str(value).strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        deduped.append(cleaned)
    return deduped


def _attach_quantity_takeoff(
    analysis: dict[str, object],
    project_settings: dict[str, object],
    build_quantity_takeoff,
) -> dict[str, object]:
    quantity_takeoff = build_quantity_takeoff(analysis, project_settings)
    merged = dict(analysis)
    merged["project_settings"] = quantity_takeoff["project_settings"]
    merged["assembly_presets"] = quantity_takeoff["assembly_presets"]
    merged["quantity_lines"] = quantity_takeoff["quantity_lines"]
    merged["trade_summary"] = quantity_takeoff["trade_summary"]
    merged["review_flags"] = quantity_takeoff["review_flags"]
    merged["review_data"] = quantity_takeoff["review_data"]
    assumptions = list(analysis.get("assumptions") or [])
    assumptions.extend(quantity_takeoff["assumptions"])
    merged["assumptions"] = _dedupe_strings(assumptions)
    return merged


def main() -> int:
    if len(sys.argv) < 4:
        raise SystemExit("Usage: desktop_bridge.py <desktop_root> <source_file> <project_settings_json>")

    desktop_root = Path(sys.argv[1]).resolve()
    source_file = Path(sys.argv[2]).resolve()
    try:
        project_settings = json.loads(sys.argv[3])
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid project settings JSON: {exc}") from exc

    if not source_file.exists():
        raise SystemExit(f"Source file not found: {source_file}")

    sys.path.insert(0, str(desktop_root))

    from takeoff_desk.env_loader import load_local_env
    from takeoff_desk.openai_takeoff_analysis import (
        analyze_document_with_openai,
        get_openai_settings,
    )
    from takeoff_desk.plan_reader import read_plan_document
    from takeoff_desk.quantity_engine import (
        build_quantity_takeoff,
        normalize_project_settings,
    )
    from takeoff_desk.takeoff_engine import analyze_takeoff

    load_local_env(desktop_root)

    file_bytes = source_file.read_bytes()
    document = read_plan_document(file_bytes, source_file.name, desktop_root)
    normalized_settings = normalize_project_settings(
        project_settings if isinstance(project_settings, dict) else {}
    )

    settings = get_openai_settings()
    if settings.enabled and settings.model:
        try:
            analysis = analyze_document_with_openai(document, normalized_settings)
        except Exception as exc:
            analysis = analyze_takeoff(document)
            diagnostics = list(analysis.get("diagnostics") or [])
            diagnostics.insert(
                0,
                "OpenAI drawing analysis could not complete, so the app fell back to local OCR/text heuristics. "
                + str(exc),
            )
            analysis["analysis_source"] = "heuristic_fallback"
            analysis["diagnostics"] = diagnostics
    else:
        analysis = analyze_takeoff(document)
        diagnostics = list(analysis.get("diagnostics") or [])
        diagnostics.insert(
            0,
            "OpenAI drawing analysis is not connected, so the app fell back to local OCR/text heuristics.",
        )
        analysis["analysis_source"] = "heuristic_fallback"
        analysis["diagnostics"] = diagnostics

    merged = _attach_quantity_takeoff(
        analysis,
        normalized_settings,
        build_quantity_takeoff,
    )
    print(json.dumps({"analysis": merged}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
