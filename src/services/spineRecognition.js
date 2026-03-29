import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { NativeModules } from "react-native";

let TextRecognitionModule = null;

try {
  TextRecognitionModule = require("@react-native-ml-kit/text-recognition").default;
} catch (error) {
  TextRecognitionModule = null;
}

const OCR_ROTATIONS = [0, 90, 180, 270];
const MIN_LINE_LENGTH = 3;
const TITLE_WORD_LIMIT = 8;
const AUTHOR_WORD_LIMIT = 4;
const LEFT_MERGE_THRESHOLD = 44;
const TOP_MERGE_THRESHOLD = 34;

const noiseWords = new Set([
  "new",
  "york",
  "times",
  "bestseller",
  "edition",
  "hardcover",
  "paperback",
  "from",
  "the",
  "author",
  "by"
]);

const normalizeWhitespace = (value) => value.replace(/\s+/g, " ").trim();

const sanitizeLine = (value) =>
  normalizeWhitespace(value)
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .trim();

const normalizeToken = (value) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const wordCount = (value) => value.split(" ").filter(Boolean).length;

const letterCount = (value) => (value.match(/\p{L}/gu) ?? []).length;

const digitCount = (value) => (value.match(/\d/gu) ?? []).length;

const isLikelyNoise = (value) => {
  const words = value
    .split(" ")
    .map(normalizeToken)
    .filter(Boolean);

  if (!words.length) {
    return true;
  }

  if (words.every((word) => noiseWords.has(word))) {
    return true;
  }

  return words.length === 1 && words[0].length <= 2;
};

const isLikelyTitle = (value) => {
  const count = wordCount(value);
  return count >= 1 && count <= TITLE_WORD_LIMIT && letterCount(value) >= 3;
};

const isLikelyAuthor = (value) => {
  const count = wordCount(value);
  return count >= 1 && count <= AUTHOR_WORD_LIMIT && letterCount(value) >= 3;
};

const isCandidateText = (value) => {
  if (value.length < MIN_LINE_LENGTH) {
    return false;
  }

  if (letterCount(value) < 2) {
    return false;
  }

  if (digitCount(value) > letterCount(value)) {
    return false;
  }

  return !isLikelyNoise(value);
};

const dedupeByText = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.text.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const sortByPosition = (left, right) => {
  const topDelta = (left.frame?.top ?? 0) - (right.frame?.top ?? 0);
  if (Math.abs(topDelta) > 14) {
    return topDelta;
  }

  return (left.frame?.left ?? 0) - (right.frame?.left ?? 0);
};

const hasSimilarPosition = (left, right) =>
  Math.abs((left.frame?.left ?? 0) - (right.frame?.left ?? 0)) <= LEFT_MERGE_THRESHOLD &&
  Math.abs((left.frame?.top ?? 0) - (right.frame?.top ?? 0)) <= TOP_MERGE_THRESHOLD;

const mergeTitleAndAuthor = (first, second) => {
  if (!first || !second) {
    return null;
  }

  const titleFirst = isLikelyTitle(first.text) && !isLikelyAuthor(first.text);
  const authorSecond = isLikelyAuthor(second.text);
  if (!titleFirst || !authorSecond) {
    return null;
  }

  return {
    text: `${first.text} by ${second.text}`,
    sourceParts: [first.text, second.text],
    frame: {
      left: Math.min(first.frame?.left ?? 0, second.frame?.left ?? 0),
      top: Math.min(first.frame?.top ?? 0, second.frame?.top ?? 0),
      width: Math.max(first.frame?.width ?? 0, second.frame?.width ?? 0),
      height:
        (Math.max(first.frame?.top ?? 0, second.frame?.top ?? 0) +
          Math.max(first.frame?.height ?? 0, second.frame?.height ?? 0)) -
        Math.min(first.frame?.top ?? 0, second.frame?.top ?? 0)
    }
  };
};

const scoreCandidate = (candidate) => {
  const words = candidate.text.split(" ").filter(Boolean);
  const letters = letterCount(candidate.text);
  const uppers = (candidate.text.match(/[A-Z]/g) ?? []).length;
  const lowers = (candidate.text.match(/[a-z]/g) ?? []).length;
  const alphaRatio = letters / Math.max(candidate.text.length, 1);

  let score = 0;
  score += Math.min(words.length, 6);
  score += Math.min(letters / 4, 5);
  score += alphaRatio * 3;

  if (candidate.text.includes(" by ")) {
    score += 2;
  }

  if (uppers > lowers && lowers > 0) {
    score += 0.5;
  }

  if (candidate.sourceParts?.length > 1) {
    score += 1;
  }

  if (candidate.frame?.width) {
    score += Math.min(candidate.frame.width / 300, 2);
  }

  if (candidate.text.length > 45) {
    score -= 1;
  }

  if (isLikelyNoise(candidate.text)) {
    score -= 3;
  }

  return score;
};

const preprocessImage = async (uri, rotation) => {
  const operations = [{ resize: { width: 1800 } }];
  if (rotation) {
    operations.push({ rotate: rotation });
  }

  return manipulateAsync(uri, operations, {
    compress: 0.92,
    format: SaveFormat.JPEG
  });
};

const analyzeVariant = async (uri, rotation) => {
  const processed = await preprocessImage(uri, rotation);
  const result = await TextRecognitionModule.recognize(processed.uri);
  const blocks = result.blocks ?? [];
  const lines = blocks.flatMap((block) => block.lines ?? []);

  const normalizedLines = dedupeByText(
    lines
      .map((line) => ({
        text: sanitizeLine(line.text ?? ""),
        frame: line.frame ?? null
      }))
      .filter((line) => isCandidateText(line.text))
      .sort(sortByPosition)
  );

  const candidates = [];
  for (let index = 0; index < normalizedLines.length; index += 1) {
    const current = normalizedLines[index];
    const next = normalizedLines[index + 1];
    const merged = mergeTitleAndAuthor(current, next);

    if (merged && hasSimilarPosition(current, next)) {
      candidates.push({
        text: merged.text,
        sourceParts: merged.sourceParts,
        frame: merged.frame
      });
      index += 1;
      continue;
    }

    candidates.push({
      text: current.text,
      sourceParts: [current.text],
      frame: current.frame
    });
  }

  return {
    rotation,
    blockCount: blocks.length,
    lineCount: lines.length,
    filteredLineCount: normalizedLines.length,
    candidates: candidates.map((candidate) => ({
      ...candidate,
      score: scoreCandidate(candidate)
    }))
  };
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

  const variantResults = [];
  for (const rotation of OCR_ROTATIONS) {
    // We deliberately spend time on a few orientations because spine text is often vertical.
    // Accuracy matters more than throughput for this step.
    // eslint-disable-next-line no-await-in-loop
    const variant = await analyzeVariant(asset.uri, rotation);
    variantResults.push(variant);
  }

  const combinedCandidates = dedupeByText(
    variantResults
      .flatMap((variant) =>
        variant.candidates.map((candidate) => ({
          ...candidate,
          sourceRotation: variant.rotation
        }))
      )
      .sort((left, right) => right.score - left.score || sortByPosition(left, right))
  );

  const bestVariant = variantResults.reduce(
    (best, current) =>
      current.candidates.length > best.candidates.length ||
      (current.candidates.length === best.candidates.length && current.lineCount > best.lineCount)
        ? current
        : best,
    variantResults[0] ?? {
      rotation: 0,
      blockCount: 0,
      lineCount: 0,
      filteredLineCount: 0,
      candidates: []
    }
  );

  const spines = combinedCandidates.slice(0, 8);

  return {
    available: true,
    reason: "",
    debug: {
      variantCount: variantResults.length,
      bestRotation: bestVariant.rotation ?? 0,
      blockCount: bestVariant.blockCount ?? 0,
      lineCount: bestVariant.lineCount ?? 0,
      filteredLineCount: bestVariant.filteredLineCount ?? 0,
      candidateCount: combinedCandidates.length,
      variantSummaries: variantResults.map((variant) => ({
        rotation: variant.rotation,
        blockCount: variant.blockCount,
        lineCount: variant.lineCount,
        filteredLineCount: variant.filteredLineCount,
        candidateCount: variant.candidates.length
      }))
    },
    spines,
    rawText: variantResults
      .map((variant) => variant.candidates.map((candidate) => candidate.text).join(" | "))
      .join("\n")
  };
};
