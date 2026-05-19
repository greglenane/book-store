from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.schemas import DetectionDebug, DetectionResponse, ImageInfo


def make_jpeg() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (20, 10), color="white").save(buffer, format="JPEG")
    return buffer.getvalue()


def test_spine_detection_endpoint_returns_detector_response(monkeypatch):
    def fake_detect(uploaded):
        width, height = uploaded.image.size
        return DetectionResponse(
            image=ImageInfo(width=width, height=height),
            regions=[],
            debug=DetectionDebug(
                model="book-spine-detector",
                modelVersion="test",
                processingMs=1,
            ),
        )

    monkeypatch.setattr("app.main.detector.detect", fake_detect)
    client = TestClient(app)

    response = client.post(
        "/image-processing/spine-detections",
        files={"image": ("shelf.jpg", make_jpeg(), "image/jpeg")},
        data={"source": "library"},
    )

    assert response.status_code == 200
    assert response.json()["image"] == {"width": 20, "height": 10}
    assert response.json()["regions"] == []


def test_spine_detection_endpoint_rejects_unsupported_upload():
    client = TestClient(app)

    response = client.post(
        "/image-processing/spine-detections",
        files={"image": ("notes.txt", b"not an image", "text/plain")},
    )

    assert response.status_code == 400

