# ML Spine Detection Plan

## Direction

The next image-processing milestone is object detection for individual book spines. The app should keep mobile capture, library picker, and preview, but the processing pipeline should stop treating the full shelf image as one OCR target.

Target flow:

```text
shelf image
-> ML object detector finds individual spine boxes
-> crop and normalize each spine region
-> OCR each spine region
-> match title and author candidates against book metadata
-> return ranked book matches for review and recommendations
```

## Why Object Detection First

Whole-image OCR is brittle on shelf photos because book text is rotated, stylized, partially occluded, and mixed with publisher marks or review blurbs. A detector gives the system a structural understanding of the shelf before text extraction runs.

Object detection should produce one bounding box per visible spine. OCR can then run on smaller, cleaner regions with known orientation and a better chance of returning a single title or title-author pair.

## Detector Contract

The detector should return normalized coordinates relative to the uploaded full image.

```json
{
  "image": {
    "width": 1800,
    "height": 1200
  },
  "regions": [
    {
      "id": "spine-1",
      "label": "book_spine",
      "confidence": 0.91,
      "box": {
        "x": 0.08,
        "y": 0.12,
        "width": 0.07,
        "height": 0.76
      },
      "rotation": 90
    }
  ]
}
```

Normalized boxes keep the mobile UI independent from image resize decisions made by the backend or model runtime.

## Model Strategy

Start backend-first. A server-side detector is easier to iterate because model size, runtime dependencies, and GPU/CPU performance are less constrained than on-device React Native.

Recommended path:

1. Collect 50-100 shelf photos from real usage scenarios.
2. Label visible book spines with bounding boxes using a tool such as CVAT, Label Studio, or Roboflow.
3. Train a small object detector with one class: `book_spine`.
4. Evaluate precision and recall on held-out shelf photos.
5. Add per-spine OCR and book metadata matching.
6. Only consider on-device inference after the backend pipeline proves useful.

YOLO-style detectors are a practical first choice because they are fast, well documented, and easy to export later if on-device inference becomes important.

## Backend API Shape

Initial endpoint:

```http
POST /image-processing/spine-detections
Content-Type: multipart/form-data
```

Request fields:

- `image`: uploaded full shelf image
- `source`: `camera` or `library`

Response:

```json
{
  "image": {
    "width": 1800,
    "height": 1200
  },
  "regions": [],
  "debug": {
    "model": "book-spine-detector",
    "modelVersion": "prototype",
    "processingMs": 0
  }
}
```

Later endpoint:

```http
POST /image-processing/book-identification
```

This can combine detection, per-spine OCR, fuzzy matching, and metadata lookup into one mobile-facing call.

## Mobile Changes

The app should render detector boxes over the selected image so failures are visible. A user correction loop will matter: users should eventually be able to remove bad boxes, adjust missed boxes, and confirm detected titles before recommendation matching.

Near-term mobile tasks:

- remove the existing shelf crop interaction
- send the full selected image to the detection endpoint
- draw returned boxes over the image preview
- run current mobile OCR per returned box
- display each spine as a reviewable row with confidence and candidate text

## Data Notes

The detector will only be as good as the labeled shelf photos. The dataset should include:

- straight-on shelf photos
- angled photos
- low light and glare
- mixed book heights
- horizontal book stacks
- tight shelves with little spacing
- non-book objects on shelves
- books with dark, white, and colorful spines

Keep raw images out of git unless they are small, non-private fixtures. Use `assets/fixtures/` only for safe sample images.
