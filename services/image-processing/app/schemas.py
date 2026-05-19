from pydantic import BaseModel, Field


class ImageInfo(BaseModel):
    width: int
    height: int


class NormalizedBox(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(ge=0, le=1)
    height: float = Field(ge=0, le=1)


class SpineRegion(BaseModel):
    id: str
    label: str = "book_spine"
    confidence: float = Field(ge=0, le=1)
    box: NormalizedBox
    rotation: int | None = None


class DetectionDebug(BaseModel):
    model: str
    modelVersion: str
    processingMs: int


class DetectionResponse(BaseModel):
    image: ImageInfo
    regions: list[SpineRegion]
    debug: DetectionDebug

