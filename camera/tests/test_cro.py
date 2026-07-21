import types
from pathlib import Path

from beadz_camera import cro as C
from beadz_camera.llama_server import ServerError


def _cfg(**over):
    base = dict(cro_impl="smolvlm", cro_server_bin=Path("/x/llama-server"),
               cro_model_path=Path("/x/m.gguf"), cro_mmproj_path=Path("/x/mm.gguf"),
               cro_ctx_size=2048, cro_best_of=3, cro_mood_hold_hours=3, cro_timeout_s=180)
    base.update(over)
    return types.SimpleNamespace(**base)


def test_get_cro_null_by_default():
    assert isinstance(C.get_cro(types.SimpleNamespace(cro_impl="null")), C.NullCRO)


def test_null_audit_ignores_args(tmp_path):
    assert C.NullCRO().audit(tmp_path / "x.jpg", 1234) is None


def test_smolvlm_happy_path(tmp_path, monkeypatch):
    img = tmp_path / "f.jpg"; img.write_bytes(b"jpeg")
    monkeypatch.setattr(C.llama_server, "start_server",
                        lambda *a, **k: (object(), "http://fake:1"))
    monkeypatch.setattr(C.llama_server, "stop_server", lambda p: None)
    slot_answers = iter(["present", "seated", "nominal"])
    monkeypatch.setattr(C.cro_calls, "audit_call",
                        lambda *a, **k: next(slot_answers))
    monkeypatch.setattr(C.cro_flavor, "best_of_flavor",
                        lambda *a, **k: "The beads elude me entirely.")
    out = C.SmolVLMCRO(_cfg()).audit(img, capture_ts=0)
    assert out == ("Reserve audit complete. Jar present. Lid seated.\n"
                   "Bead level nominal. Collateralization ratio: 100.0%.\n"
                   "The beads elude me entirely. The Fault remains secure.")


def test_smolvlm_server_failure_returns_none(tmp_path, monkeypatch):
    img = tmp_path / "f.jpg"; img.write_bytes(b"jpeg")
    monkeypatch.setattr(C.llama_server, "start_server",
                        lambda *a, **k: (_ for _ in ()).throw(ServerError("no fit")))
    assert C.SmolVLMCRO(_cfg()).audit(img, capture_ts=0) is None


def test_smolvlm_flavor_none_still_renders(tmp_path, monkeypatch):
    img = tmp_path / "f.jpg"; img.write_bytes(b"jpeg")
    killed = []
    monkeypatch.setattr(C.llama_server, "start_server",
                        lambda *a, **k: (object(), "http://fake:1"))
    monkeypatch.setattr(C.llama_server, "stop_server", lambda p: killed.append(p))
    ans = iter(["present", "ajar", "low"])
    monkeypatch.setattr(C.cro_calls, "audit_call", lambda *a, **k: next(ans))
    monkeypatch.setattr(C.cro_flavor, "best_of_flavor", lambda *a, **k: None)
    out = C.SmolVLMCRO(_cfg()).audit(img, capture_ts=0)
    assert out is None            # a failed flavor makes the whole audit advisory-null
    assert killed                 # server still torn down
