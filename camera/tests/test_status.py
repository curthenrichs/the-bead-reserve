import json

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
