# book-store

Mobile app prototype for capturing shelf photos and turning them into personalized book recommendations.

## Getting started

1. Install dependencies with `npm install`
2. Start the Expo dev server with `npm run start`
3. Open the app in Expo Go, an iOS simulator, or an Android emulator

## Current milestone

The first implemented flow is image intake:
- take a shelf photo in-app
- choose a shelf photo from the device library
- preview the selected image
- run on-device OCR to read book spine text
- trigger a placeholder upload step for later processing

## OCR development note

Book-spine reading uses `@react-native-ml-kit/text-recognition`, which is a native module. Expo Go can still preview the intake UI, but OCR itself requires a development build.

Use Android locally with:

```powershell
npx expo run:android
```

On iOS, you will need a macOS build environment to create the native app after adding the module.

## Next steps

- connect the upload action to a real backend endpoint
- improve OCR post-processing into clean book-title candidates
- match detected books against Goodreads history
