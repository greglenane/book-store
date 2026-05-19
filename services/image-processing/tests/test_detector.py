from app.detector import normalize_xyxy_box


def test_normalize_xyxy_box_clamps_to_image_bounds():
    box = normalize_xyxy_box([-10, 20, 220, 140], image_width=200, image_height=100)

    assert box.x == 0
    assert box.y == 0.2
    assert box.width == 1
    assert box.height == 0.8

