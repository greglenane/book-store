import { NativeModules } from "react-native";

let TextRecognitionModule = null;

try {
  TextRecognitionModule = require("@react-native-ml-kit/text-recognition").default;
} catch (error) {
  TextRecognitionModule = null;
}

const sanitizeLine = (value) =>
  value
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .trim();

const isCandidateSpineText = (value) => {
  const letters = value.match(/\p{L}/gu) ?? [];
  return value.length >= 3 && letters.length >= 2;
};

const dedupeLines = (lines) => {
  const seen = new Set();

  return lines.filter((line) => {
    const key = line.text.toLowerCase();
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

export const getSpineRecognitionAvailability = () => {
  if (!TextRecognitionModule || !NativeModules.TextRecognition) {
    return {
      available: false,
      reason:
        "Book-spine OCR needs a native development build. Expo Go can preview image intake, but it cannot load the ML Kit text recognition module."
    };
  }

  return { available: true, reason: "" };
};

export const recognizeBookSpines = async (asset) => {
  if (!asset?.uri) {
    throw new Error("A selected image is required before spine recognition can run.");
  }

  const availability = getSpineRecognitionAvailability();
  if (!availability.available) {
    return {
      ...availability,
      spines: [],
      rawText: ""
    };
  }

  const result = await TextRecognitionModule.recognize(asset.uri);
  const blocks = result.blocks ?? [];
  const lines = blocks.flatMap((block) => block.lines ?? []);
  const spineLines = dedupeLines(
    lines
      .map((line) => ({
        text: sanitizeLine(line.text ?? ""),
        frame: line.frame ?? null
      }))
      .filter((line) => isCandidateSpineText(line.text))
      .sort((left, right) => {
        const topDelta = (left.frame?.top ?? 0) - (right.frame?.top ?? 0);
        if (Math.abs(topDelta) > 16) {
          return topDelta;
        }

        return (left.frame?.left ?? 0) - (right.frame?.left ?? 0);
      })
  );

  return {
    available: true,
    reason: "",
    debug: {
      blockCount: blocks.length,
      lineCount: lines.length
    },
    spines: spineLines,
    rawText: result.text ?? ""
  };
};
