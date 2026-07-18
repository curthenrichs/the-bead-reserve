import json

import pytest

from beadz_camera.queue import CounterError, StateDir


@pytest.fixture()
def state(tmp_path):
    s = StateDir(tmp_path / "state")
    s.seed_counter(0)
    return s


def _meta(counter):
    return {"counter": counter, "ts": 1750000000, "sha256": "ab" * 32,
            "sig": "cd" * 64, "croText": None}


def _enqueue_frame(state, tmp_path, counter):
    src = tmp_path / f"tmp-{counter}.jpg"
    src.write_bytes(b"jpegbytes-%d" % counter)
    state.enqueue(counter, src, _meta(counter))


def test_counter_increments_and_persists(state):
    assert state.next_counter() == 1
    assert state.next_counter() == 2
    reopened = StateDir(state.root)
    assert reopened.next_counter() == 3


def test_missing_counter_is_fatal(tmp_path):
    with pytest.raises(CounterError):
        StateDir(tmp_path / "fresh").next_counter()


def test_corrupt_counter_is_fatal(state):
    (state.root / "counter").write_text("not-a-number")
    with pytest.raises(CounterError):
        state.next_counter()


def test_seed_refuses_overwrite(state):
    with pytest.raises(FileExistsError):
        state.seed_counter(5)


def test_enqueue_and_pending_ordering(state, tmp_path):
    for c in (3, 1, 2):
        _enqueue_frame(state, tmp_path, c)
    assert [f.counter for f in state.pending()] == [1, 2, 3]
    assert state.pending()[0].meta == _meta(1)


def test_pending_skips_json_without_jpg(state, tmp_path):
    _enqueue_frame(state, tmp_path, 1)
    orphan = state.root / "queue" / "2.json"
    orphan.write_text(json.dumps(_meta(2)))
    assert [f.counter for f in state.pending()] == [1]


def test_archive_moves_both_files(state, tmp_path):
    _enqueue_frame(state, tmp_path, 1)
    frame = state.pending()[0]
    state.archive(frame)
    assert state.pending() == []
    assert (state.root / "archive" / "1.jpg").exists()
    assert (state.root / "archive" / "1.json").exists()
