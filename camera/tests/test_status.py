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
