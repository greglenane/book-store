# Image Processing Service

FastAPI service for detecting individual book spines in full shelf photos.

## Setup

```powershell
cd services/image-processing
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Train

Add YOLO-format shelf images and labels under `datasets/book-spines/`, then run:

```powershell
python train.py
```

The training script writes the best weights to `models/book-spine-detector.pt`.

## Run

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The Android emulator can reach this service at `http://10.0.2.2:8000`.

## Test

```powershell
python -m pytest tests
```
