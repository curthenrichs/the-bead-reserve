import os

from beadz_camera.fsio import atomic_write_text


def test_writes_content(tmp_path):
    target = tmp_path / "out.txt"
    atomic_write_text(target, "hello\n")
    assert target.read_text() == "hello\n"


def test_overwrites_atomically(tmp_path):
    target = tmp_path / "out.txt"
    target.write_text("old")
    atomic_write_text(target, "new")
    assert target.read_text() == "new"


def test_tmp_name_is_pid_unique(tmp_path, monkeypatch):
    seen = []
    real_replace = os.replace

    def spy(src, dst):
        seen.append(str(src))
        real_replace(src, dst)

    monkeypatch.setattr(os, "replace", spy)
    atomic_write_text(tmp_path / "out.txt", "x")
    assert f".{os.getpid()}.tmp" in seen[0]


def test_no_tmp_left_behind(tmp_path):
    atomic_write_text(tmp_path / "out.txt", "x")
    assert [p.name for p in tmp_path.iterdir()] == ["out.txt"]
