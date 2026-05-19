# book-store

Mobile app prototype for capturing shelf photos and turning them into personalized book recommendations.

## Getting started

1. Install dependencies with `npm install`
2. Start the image-processing API from `services/image-processing`
3. Start the Expo dev server with `npm run start`
4. Open the app in Expo Go, an iOS simulator, or an Android emulator

The Android emulator uses `http://10.0.2.2:8000` for the detector API by default. For a physical device, set `EXPO_PUBLIC_DETECTION_API_BASE_URL` to your computer's LAN URL before starting Expo.

## Current milestone

The first implemented flow is image intake:
- take a shelf photo in-app
- choose a shelf photo from the device library
- preview the selected image
- upload the full selected image to a local spine-detection API
- render returned spine boxes over the preview
- run on-device OCR per detected spine

## Image processing direction

The current processing direction is ML object detection for individual book spines. Instead of running OCR over the whole shelf image, the target pipeline is:

```text
shelf photo -> spine detection boxes -> per-spine OCR -> book metadata matching
```

See [docs/ml-spine-detection.md](docs/ml-spine-detection.md) for the proposed detector contract, backend API shape, and data collection plan.

## Image processing API

Set up the Python service:

```powershell
cd services/image-processing
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Train a first detector after adding YOLO-format images and labels under `datasets/book-spines/`:

```powershell
python train.py
```

Run the API:

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## OCR development note

Book-spine reading uses `@react-native-ml-kit/text-recognition`, which is a native module. Expo Go can still preview the intake UI, but OCR itself requires a development build.

Use Android locally with:

```powershell
npx expo run:android
```

On iOS, you will need a macOS build environment to create the native app after adding the module.

## Next steps

- collect and label shelf photos for a one-class `book_spine` detector
- train the first `services/image-processing/models/book-spine-detector.pt` model
- tune detection confidence and per-spine OCR quality on held-out shelf photos
- match detected books against Goodreads history
