"""results.jsonl order/shape (round-trip parsed) + transcript content."""

import json
from pathlib import Path

from beadz_cro_bench.results import RunWriter


def _write_sample_run(out_dir: Path) -> None:
    w = RunWriter(out_dir)
    w.run_start(model="m.gguf", model_load_s=42.5, platform="linux")
    w.call("v1", "a.jpg", "jar", "Is a jar present?", response="present", wall_ms=900)
    w.call("v1", "a.jpg", "flavor", "Remark.", error="HTTP 500: boom")
    w.audit("v1", "a.jpg", {"jar": "present"}, {"jar": 900},
            None, error="flavor: HTTP 500: boom")
    w.audit("v1", "b.jpg", {"jar": "present", "flavor": "The beads persist."},
            {"jar": 800, "flavor": 3000},
            "Reserve audit complete. Jar present.\nThe beads persist.")
    w.run_end(ok_calls=3, failed_calls=1, peak_rss_kb=612000)


def test_jsonl_order_and_shape(tmp_path):
    _write_sample_run(tmp_path / "run")
    lines = [json.loads(l) for l in
             (tmp_path / "run" / "results.jsonl").read_text(encoding="utf-8").splitlines()]
    assert [l["type"] for l in lines] == [
        "run_start", "call", "call", "audit", "audit", "run_end"]
    assert lines[0]["model_load_s"] == 42.5
    assert lines[1]["response"] == "present" and lines[1]["wall_ms"] == 900
    assert lines[2]["error"] == "HTTP 500: boom" and lines[2]["response"] is None
    assert lines[3]["error"] and lines[3]["text"] is None
    assert lines[-1] == {"type": "run_end", "ts": lines[-1]["ts"],
                         "ok_calls": 3, "failed_calls": 1, "peak_rss_kb": 612000}


def test_transcript_content(tmp_path):
    _write_sample_run(tmp_path / "run")
    md = (tmp_path / "run" / "transcript.md").read_text(encoding="utf-8")
    assert "## a.jpg × v1" in md
    assert "`jar` → present  (900 ms)" in md
    assert "**FAILED:** flavor: HTTP 500: boom" in md
    assert "## b.jpg × v1" in md
    # multi-line audit is blockquoted line by line
    assert "> Reserve audit complete. Jar present.\n> The beads persist." in md
    assert "peak RSS kB: 612000" in md
