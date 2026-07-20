"""CLI smoke + (Task 6) run-command wiring tests."""

from beadz_cro_bench import cli


def test_help_lists_subcommands(capsys):
    try:
        cli.main(["--help"])
    except SystemExit as exc:
        assert exc.code == 0
    out = capsys.readouterr().out
    assert "run" in out
    assert "fetch-models" in out


import json
import shutil
from pathlib import Path

import pytest

from beadz_cro_bench import calls, cli, server
from beadz_cro_bench.calls import CallError

V1 = Path(__file__).resolve().parents[1] / "variants" / "v1"


class FakeProc:
    pid = 4242

    def poll(self):
        return None

    def terminate(self):
        pass

    def wait(self, timeout=None):
        return 0

    def kill(self):
        pass


@pytest.fixture()
def bench_dir(tmp_path, monkeypatch):
    """A cro-bench-shaped cwd: variants/v1 + samples/ with two fake images."""
    shutil.copytree(V1, tmp_path / "variants" / "v1")
    (tmp_path / "samples").mkdir()
    (tmp_path / "samples" / "a.jpg").write_bytes(b"fake-jpeg-a")
    (tmp_path / "samples" / "b.jpg").write_bytes(b"fake-jpeg-b")
    monkeypatch.chdir(tmp_path)
    return tmp_path


@pytest.fixture()
def fake_server(monkeypatch):
    monkeypatch.setattr(server, "start_server",
                        lambda *a, **k: (FakeProc(), "http://fake:1", 42.5))
    monkeypatch.setattr(server, "peak_rss_kb", lambda pid: 612000)
    monkeypatch.setattr(server, "stop_server", lambda proc: None)


def _answers(cid):
    return {"jar": "present", "lid": "seated", "level": "nominal",
            "flavor": "The beads persist."}[cid]


def test_run_all_ok_exit_0(bench_dir, fake_server, monkeypatch):
    seen = []

    def fake_call(base_url, persona, prompt, image_b64, sampling,
                  grammar=None, timeout=600.0, mime="image/jpeg"):
        cid = {"Is a jar present in the frame? Answer present or absent.": "jar",
               "Is the lid seated or ajar?": "lid",
               "Is the jar overfull, nominal, low, or depleted?": "level"}.get(prompt, "flavor")
        seen.append((cid, grammar is not None))
        return _answers(cid), 5

    monkeypatch.setattr(calls, "audit_call", fake_call)
    rc = cli.main(["run", "--variant", "v1", "--run-name", "t"])
    assert rc == 0
    # 2 images x (3 slots + flavor); slots carry a grammar, flavor doesn't
    assert len(seen) == 8
    assert all(has_g for cid, has_g in seen if cid != "flavor")
    assert all(not has_g for cid, has_g in seen if cid == "flavor")
    lines = [json.loads(l) for l in
             Path("out/t/results.jsonl").read_text(encoding="utf-8").splitlines()]
    assert lines[0]["type"] == "run_start" and lines[0]["model_load_s"] == 42.5
    assert lines[-1] == {"type": "run_end", "ts": lines[-1]["ts"],
                         "ok_calls": 8, "failed_calls": 0, "peak_rss_kb": 612000}
    audits = [l for l in lines if l["type"] == "audit"]
    assert len(audits) == 2
    assert audits[0]["text"].startswith("Reserve audit complete. Jar present.")


def test_run_call_failure_exit_1(bench_dir, fake_server, monkeypatch):
    def fake_call(base_url, persona, prompt, image_b64, sampling,
                  grammar=None, timeout=600.0, mime="image/jpeg"):
        if grammar is None:  # fail every flavor call
            raise CallError("HTTP 500: boom")
        return "nominal", 5

    monkeypatch.setattr(calls, "audit_call", fake_call)
    rc = cli.main(["run", "--variant", "v1", "--run-name", "t"])
    assert rc == 1
    lines = [json.loads(l) for l in
             Path("out/t/results.jsonl").read_text(encoding="utf-8").splitlines()]
    assert lines[-1]["failed_calls"] == 2  # one flavor per image
    audits = [l for l in lines if l["type"] == "audit"]
    assert all(a["text"] is None and "flavor" in a["error"] for a in audits)


def test_run_bad_variant_exit_2(bench_dir, fake_server, capsys):
    rc = cli.main(["run", "--variant", "nope", "--run-name", "t"])
    assert rc == 2
    assert "setup error" in capsys.readouterr().err


def test_run_no_images_exit_2(bench_dir, fake_server, capsys):
    for p in (bench_dir / "samples").iterdir():
        p.unlink()
    rc = cli.main(["run", "--variant", "v1", "--run-name", "t"])
    assert rc == 2
    assert "no images" in capsys.readouterr().err


def test_run_image_read_failure_exit_1(bench_dir, fake_server, monkeypatch):
    """A mid-run per-image encode failure (e.g. a corrupt file) is a failed
    unit, not a setup error: exit 1, sweep continues to the next image."""
    def fake_encode(path):
        if path.name == "a.jpg":
            raise OSError("cannot identify image file")
        return "aGk="

    def fake_call(base_url, persona, prompt, image_b64, sampling,
                  grammar=None, timeout=600.0, mime="image/jpeg"):
        cid = {"Is a jar present in the frame? Answer present or absent.": "jar",
               "Is the lid seated or ajar?": "lid",
               "Is the jar overfull, nominal, low, or depleted?": "level"}.get(prompt, "flavor")
        return _answers(cid), 5

    monkeypatch.setattr(calls, "encode_image", fake_encode)
    monkeypatch.setattr(calls, "audit_call", fake_call)
    rc = cli.main(["run", "--variant", "v1", "--run-name", "t"])
    assert rc == 1
    lines = [json.loads(l) for l in
             Path("out/t/results.jsonl").read_text(encoding="utf-8").splitlines()]
    assert lines[-1]["type"] == "run_end"
    assert lines[-1]["failed_calls"] == 1
    assert lines[-1]["ok_calls"] == 4  # b.jpg's 3 slots + flavor; a.jpg skipped entirely
    audits = [l for l in lines if l["type"] == "audit"]
    assert len(audits) == 2
    good = next(a for a in audits if a["image"] == "b.jpg")
    assert good["error"] is None
    assert good["text"].startswith("Reserve audit complete.")
    bad = next(a for a in audits if a["image"] == "a.jpg")
    assert bad["text"] is None
    assert "cannot read image" in bad["error"]


def test_run_server_url_skips_spawn(bench_dir, monkeypatch):
    spawned = []
    monkeypatch.setattr(server, "start_server",
                        lambda *a, **k: spawned.append(1))
    monkeypatch.setattr(server, "wait_healthy", lambda url, timeout, proc=None: 0.0)
    monkeypatch.setattr(calls, "audit_call",
                        lambda *a, **k: ("nominal", 5))
    rc = cli.main(["run", "--variant", "v1", "--run-name", "t",
                   "--server-url", "http://127.0.0.1:9999"])
    assert rc == 0
    assert spawned == []
    lines = [json.loads(l) for l in
             Path("out/t/results.jsonl").read_text(encoding="utf-8").splitlines()]
    assert lines[0]["model_load_s"] is None      # warm mode: not a cold-start datum
    assert lines[-1]["peak_rss_kb"] is None      # not our process to measure
