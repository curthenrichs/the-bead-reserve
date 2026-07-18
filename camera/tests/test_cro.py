import pytest

from beadz_camera.cro import CRO, NullCRO, get_cro


def test_null_cro_returns_none(tmp_path):
    assert NullCRO().audit(tmp_path / "frame.jpg") is None


def test_get_cro_default_is_null():
    assert isinstance(get_cro(), NullCRO)


def test_get_cro_unknown_raises():
    with pytest.raises(ValueError, match="unknown CRO"):
        get_cro("smolvlm")  # not implemented yet — this plan ships NullCRO only


def test_null_cro_satisfies_protocol():
    cro: CRO = NullCRO()  # structural check; fails to type-narrow if drifted
    assert hasattr(cro, "audit")
