import pytest
from PIL import Image

from beadz_camera.process import ProcessError, crop_and_strip


@pytest.fixture()
def raw_frame(tmp_path, make_exif_jpeg):
    """A synthetic 'raw capture' carrying EXIF metadata."""
    return make_exif_jpeg(tmp_path / "raw.jpg")


def test_crops_to_rect(raw_frame, tmp_path):
    out = tmp_path / "out.jpg"
    crop_and_strip(raw_frame, out, (100, 50, 200, 150))
    assert Image.open(out).size == (200, 150)


def test_output_has_no_exif(raw_frame, tmp_path):
    out = tmp_path / "out.jpg"
    crop_and_strip(raw_frame, out, (0, 0, 640, 480))
    assert len(Image.open(out).getexif()) == 0


def test_corrupt_input_raises(tmp_path):
    bad = tmp_path / "bad.jpg"
    bad.write_bytes(b"\xff\xd8 this is not a jpeg")
    with pytest.raises(ProcessError):
        crop_and_strip(bad, tmp_path / "out.jpg", (0, 0, 10, 10))


def test_crop_exceeding_frame_raises(make_exif_jpeg, tmp_path):
    src = make_exif_jpeg(tmp_path / "raw.jpg", size=(100, 100))
    with pytest.raises(ProcessError, match="exceeds frame"):
        crop_and_strip(src, tmp_path / "out.jpg", (50, 50, 100, 100))


def test_crop_negative_origin_raises(make_exif_jpeg, tmp_path):
    src = make_exif_jpeg(tmp_path / "raw.jpg", size=(640, 480))
    with pytest.raises(ProcessError, match="exceeds frame"):
        crop_and_strip(src, tmp_path / "out.jpg", (-1, 0, 10, 10))
