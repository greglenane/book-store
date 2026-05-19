from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from .detector import DetectorUnavailableError, InvalidImageError, detector, load_uploaded_image
from .schemas import DetectionResponse


app = FastAPI(title="Book Store Image Processing", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/image-processing/spine-detections", response_model=DetectionResponse)
async def detect_spines(
    image: UploadFile = File(...),
    source: str | None = Form(default=None),
) -> DetectionResponse:
    del source
    content = await image.read()

    try:
        uploaded = load_uploaded_image(content, image.content_type)
        return detector.detect(uploaded)
    except InvalidImageError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except DetectorUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

