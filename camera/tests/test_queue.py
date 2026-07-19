import json

import pytest

from beadz_camera.queue import CounterError, StateDir


@pytest.fixture()
def state(tmp_path):
    s = StateDir(tmp_path / "state")
    s.seed_counter(0)
    return s


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


def test_enqueue_and_pending_ordering(state, enqueue_frame, frame_meta):
    for c in (3, 1, 2):
        enqueue_frame(state, c)
    assert [f.counter for f in state.pending()] == [1, 2, 3]
    assert state.pending()[0].meta == frame_meta(1)


def test_pending_skips_json_without_jpg(state, enqueue_frame, frame_meta):
    enqueue_frame(state, 1)
    orphan = state.root / "queue" / "2.json"
    orphan.write_text(json.dumps(frame_meta(2)))
    assert [f.counter for f in state.pending()] == [1]


def test_archive_moves_both_files(state, enqueue_frame):
    enqueue_frame(state, 1)
    frame = state.pending()[0]
    state.archive(frame)
    assert state.pending() == []
    assert (state.root / "archive" / "1.jpg").exists()
    assert (state.root / "archive" / "1.json").exists()


def test_pending_heals_crashed_archive(state, enqueue_frame):
    enqueue_frame(state, 1)
    # simulate a crash between archive()'s two moves: jpg archived, json left behind
    (state.root / "queue" / "1.jpg").rename(state.root / "archive" / "1.jpg")
    assert state.pending() == []                          # not pushable
    assert (state.root / "archive" / "1.json").exists()   # heal completed the move
    assert not (state.root / "queue" / "1.json").exists()


def test_seed_force_recovers_corrupt_counter(state):
    (state.root / "counter").write_text("not-a-number")
    state.seed_counter(41, force=True)
    assert state.next_counter() == 42


def test_corrupt_counter_message_names_working_recovery(state):
    (state.root / "counter").write_text("not-a-number")
    with pytest.raises(CounterError, match="--force"):
        state.next_counter()


def test_pending_reclaims_orphaned_jpg(state, enqueue_frame):
    enqueue_frame(state, 1)                       # a normal, committed frame
    (state.root / "queue" / "7.jpg").write_bytes(b"orphan")  # crashed enqueue: no json
    result = state.pending()
    assert [f.counter for f in result] == [1]     # orphan not surfaced
    assert not (state.root / "queue" / "7.jpg").exists()     # and reclaimed
    assert (state.root / "queue" / "1.jpg").exists()         # committed frame untouched


def test_pending_leaves_non_frame_jpg_alone(state, enqueue_frame):
    enqueue_frame(state, 1)
    (state.root / "queue" / "snapshot.jpg").write_bytes(b"manual artifact")
    state.pending()
    assert (state.root / "queue" / "snapshot.jpg").exists()  # non-numeric stem untouched
