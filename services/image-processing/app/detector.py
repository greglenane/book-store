import os
import time
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from .schemas import DetectionDebug, DetectionResponse, ImageInfo, NormalizedBox, SpineRegion


ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
DEFAULT_MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "book-spine-detector.pt"
MODEL_PATH = Path(os.getenv("BOOK_SPINE_MODEL_PATH", DEFAULT_MODEL_PATH))
MODEL_VERSION = os.getenv("BOOK_SPINE_MODEL_VERSION", "prototype")
CONFIDENCE_THRESHOLD = float(os.getenv("BOOK_SPINE_CONFIDENCE", "0.25"))


@dataclass
class UploadedImage:
    image: Image.Image
    content: bytes


class DetectorUnavailableError(RuntimeError):
    pass


class InvalidImageError(ValueError):
    pass


def load_uploaded_image(content: bytes, content_type: str | None) -> UploadedImage:
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise InvalidImageError("Upload must be a JPEG, PNG, or WebP image.")

    try:
        image = Image.open(BytesIO(content))
        image.load()
    except UnidentifiedImageError as exc:
        raise InvalidImageError("Upload could not be decoded as an image.") from exc

    return UploadedImage(image=image.convert("RGB"), content=content)


def normalize_xyxy_box(box: list[float], image_width: int, image_height: int) -> NormalizedBox:
    left, top, right, bottom = box
    left = max(0.0, min(left, image_width))
    top = max(0.0, min(top, image_height))
    right = max(left, min(right, image_width))
    bottom = max(top, min(bottom, image_height))

    return NormalizedBox(
        x=left / image_width,
        y=top / image_height,
        width=(right - left) / image_width,
        height=(bottom - top) / image_height,
    )


class BookSpineDetector:
    def __init__(self, model_path: Path = MODEL_PATH):
        self.model_path = model_path
        self._model = None

    def _load_model(self):
        if self._model is not None:
            return self._model

        if not self.model_path.exists():
            raise DetectorUnavailableError(f"Model file not found: {self.model_path}")

        try:
            from ultralytics import YOLO
        except ImportError as exc:
            raise DetectorUnavailableError("Install service requirements before running inference.") from exc

        self._model = YOLO(str(self.model_path))
        return self._model

    def detect(self, uploaded: UploadedImage) -> DetectionResponse:
        started = time.perf_counter()
        model = self._load_model()
        width, height = uploaded.image.size
        predictions = model.predict(
            source=uploaded.image,
            conf=CONFIDENCE_THRESHOLD,
            verbose=False,
        )

        regions: list[SpineRegion] = []
        if predictions:
            boxes = predictions[0].boxes
            for index, detected_box in enumerate(boxes, start=1):
                xyxy = detected_box.xyxy[0].tolist()
                confidence = float(detected_box.conf[0])
                regions.append(
                    SpineRegion(
                        id=f"spine-{index}",
                        confidence=confidence,
                        box=normalize_xyxy_box(xyxy, width, height),
                    )
                )

        processing_ms = int((time.perf_counter() - started) * 1000)
        return DetectionResponse(
            image=ImageInfo(width=width, height=height),
            regions=regions,
            debug=DetectionDebug(
                model="book-spine-detector",
                modelVersion=MODEL_VERSION,
                processingMs=processing_ms,
            ),
        )


detector = BookSpineDetector()

