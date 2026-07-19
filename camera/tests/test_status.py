import json
import os

from beadz_camera.status import update_status


def test_creates_and_merges(tmp_path):
    update_status(tmp_path, last_capture_ok=True, queue_depth=3)
    update_status(tmp_path, queue_depth=0, last_error=None)
    data = json.loads((tmp_path / "status.json").read_text())
    assert data["last_capture_ok"] is True   # survived the merge
    assert data["queue_depth"] == 0          # overwritten
    assert data["last_error"] is None
    assert isinstance(data["updated_ts"], int)


def test_tolerates_corrupt_existing(tmp_path):
    (tmp_path / "status.json").write_text("{not json")
    update_status(tmp_path, queue_depth=1)
    assert json.loads((tmp_path / "status.json").read_text())["queue_depth"] == 1


def test_concurrent_writers_use_distinct_tmp_names(tmp_path, monkeypatch):
    # two processes must never share a tmp file; ours is PID-suffixed
    seen = []
    real_replace = os.replace

    def spy(src, dst):
        seen.append(str(src))
        real_replace(src, dst)

    monkeypatch.setattr(os, "replace", spy)
    update_status(tmp_path, queue_depth=1)
    assert f".{os.getpid()}.tmp" in seen[0]


def _write_count(monkeypatch):
    calls = []
    import beadz_camera.status as st
    real = st.atomic_write_text
    monkeypatch.setattr(st, "atomic_write_text",
                        lambda p, t: (calls.append(1), real(p, t))[1])
    return calls


def test_throttle_skips_unchanged_within_interval(tmp_path, monkeypatch):
    update_status(tmp_path, queue_depth=0, last_push_ok=True)          # seed
    calls = _write_count(monkeypatch)
    update_status(tmp_path, 3600, queue_depth=0, last_push_ok=True)    # idle, fresh
    assert calls == []                                                 # no write


def test_throttle_writes_on_change(tmp_path, monkeypatch):
    update_status(tmp_path, queue_depth=0, last_push_ok=True)
    calls = _write_count(monkeypatch)
    update_status(tmp_path, 3600, queue_depth=5, last_push_ok=True)    # changed
    assert calls == [1]


def test_throttle_writes_when_stale(tmp_path, monkeypatch):
    import json
    update_status(tmp_path, queue_depth=0, last_push_ok=True)
    data = json.loads((tmp_path / "status.json").read_text())
    data["updated_ts"] = data["updated_ts"] - 4000                    # older than interval
    (tmp_path / "status.json").write_text(json.dumps(data))
    calls = _write_count(monkeypatch)
    update_status(tmp_path, 3600, queue_depth=0, last_push_ok=True)   # unchanged but stale
    assert calls == [1]
