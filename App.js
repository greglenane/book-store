import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { detectBookSpines, DETECTION_API_BASE_URL } from "./src/services/spineDetection";
import {
  getSpineRecognitionAvailability,
  recognizeBookSpines
} from "./src/services/spineRecognition";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const getRenderedImageFrame = (containerLayout, imageSize) => {
  if (!containerLayout?.width || !containerLayout?.height || !imageSize?.width || !imageSize?.height) {
    return null;
  }

  const containerAspect = containerLayout.width / containerLayout.height;
  const imageAspect = imageSize.width / imageSize.height;

  if (imageAspect > containerAspect) {
    const width = containerLayout.width;
    const height = width / imageAspect;
    return {
      x: 0,
      y: (containerLayout.height - height) / 2,
      width,
      height
    };
  }

  const height = containerLayout.height;
  const width = height * imageAspect;
  return {
    x: (containerLayout.width - width) / 2,
    y: 0,
    width,
    height
  };
};

const resolveImageSize = (uri) =>
  new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });

const normalizeBoxToSourceCrop = (box, imageSize) => {
  const originX = Math.floor(clamp(box.x, 0, 0.999) * imageSize.width);
  const originY = Math.floor(clamp(box.y, 0, 0.999) * imageSize.height);
  const width = Math.round(clamp(box.width, 0, 1) * imageSize.width);
  const height = Math.round(clamp(box.height, 0, 1) * imageSize.height);

  return {
    originX,
    originY,
    width: Math.max(1, Math.min(width, imageSize.width - originX)),
    height: Math.max(1, Math.min(height, imageSize.height - originY))
  };
};

const getDetectionBoxStyle = (region, frame) => ({
  left: frame.x + region.box.x * frame.width,
  top: frame.y + region.box.y * frame.height,
  width: region.box.width * frame.width,
  height: region.box.height * frame.height
});

export default function App() {
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedImageSource, setSelectedImageSource] = useState("library");
  const [imageSize, setImageSize] = useState(null);
  const [previewLayout, setPreviewLayout] = useState(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [detectedRegions, setDetectedRegions] = useState([]);
  const [spineResults, setSpineResults] = useState([]);
  const [detectionDebug, setDetectionDebug] = useState(null);

  const resetAnalysis = () => {
    setStatusMessage("");
    setDetectedRegions([]);
    setSpineResults([]);
    setDetectionDebug(null);
  };

  const handlePickResult = async (result, source) => {
    if (result.canceled || !result.assets?.length) {
      return;
    }

    const asset = result.assets[0];
    setSelectedImage(asset);
    setSelectedImageSource(source);
    setImageSize(asset.width && asset.height ? { width: asset.width, height: asset.height } : null);
    resetAnalysis();

    if ((!asset.width || !asset.height) && asset.uri) {
      try {
        const size = await resolveImageSize(asset.uri);
        setImageSize(size);
      } catch (error) {
        setImageSize(null);
      }
    }
  };

  const requestPermission = async (type) => {
    const permission =
      type === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Permission required",
        type === "camera"
          ? "Camera access is required to capture shelf photos."
          : "Photo library access is required to choose an existing shelf photo."
      );
      return false;
    }

    return true;
  };

  const openCamera = async () => {
    const hasPermission = await requestPermission("camera");
    if (!hasPermission) {
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      mediaTypes: ["images"],
      quality: 0.8
    });

    await handlePickResult(result, "camera");
  };

  const openLibrary = async () => {
    const hasPermission = await requestPermission("library");
    if (!hasPermission) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      mediaTypes: ["images"],
      quality: 0.8
    });

    await handlePickResult(result, "library");
  };

  const recognizeRegionText = async (region) => {
    const sourceCrop = normalizeBoxToSourceCrop(region.box, imageSize);
    const spineAsset = await manipulateAsync(
      selectedImage.uri,
      [{ crop: sourceCrop }],
      {
        compress: 0.95,
        format: SaveFormat.JPEG
      }
    );

    const result = await recognizeBookSpines(spineAsset);
    if (!result.available) {
      return {
        ...region,
        ocrAvailable: false,
        message: result.reason,
        textCandidates: [],
        rawText: ""
      };
    }

    return {
      ...region,
      ocrAvailable: true,
      message: result.spines.length
        ? `Read ${result.spines.length} text candidate${result.spines.length === 1 ? "" : "s"}.`
        : "No strong text candidates found for this spine.",
      textCandidates: result.spines,
      rawText: result.rawText,
      ocrDebug: result.debug ?? null
    };
  };

  const handleDetect = async () => {
    if (!selectedImage) {
      Alert.alert("No image selected", "Choose or capture a shelf photo first.");
      return;
    }

    if (!imageSize?.width || !imageSize?.height) {
      Alert.alert("Image not ready", "The selected image dimensions are still loading.");
      return;
    }

    try {
      setIsDetecting(true);
      setIsAnalyzing(false);
      setStatusMessage("Detecting book spines...");
      setDetectedRegions([]);
      setSpineResults([]);
      setDetectionDebug(null);

      const detection = await detectBookSpines(selectedImage, selectedImageSource);
      const regions = detection.regions ?? [];
      setDetectedRegions(regions);
      setDetectionDebug(detection.debug ?? null);

      if (!regions.length) {
        setStatusMessage("No book spines were detected. Try a clearer, straighter shelf photo.");
        return;
      }

      setIsAnalyzing(true);
      setStatusMessage(`Detected ${regions.length} spine${regions.length === 1 ? "" : "s"}. Reading text...`);

      const results = [];
      for (const region of regions) {
        // OCR depends on native ML Kit and image manipulation, so keep this sequential to reduce memory spikes.
        // eslint-disable-next-line no-await-in-loop
        const result = await recognizeRegionText(region);
        results.push(result);
        setSpineResults([...results]);
      }

      setStatusMessage(`Detected and analyzed ${regions.length} spine${regions.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setDetectedRegions([]);
      setSpineResults([]);
      setDetectionDebug(null);
      setStatusMessage(error.message || "Spine detection service unavailable.");
    } finally {
      setIsDetecting(false);
      setIsAnalyzing(false);
    }
  };

  const ocrAvailability = getSpineRecognitionAvailability();
  const previewFrame = getRenderedImageFrame(previewLayout, imageSize);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>Book discovery from the shelf</Text>
        <Text style={styles.title}>Bookshelf Scanner</Text>
        <Text style={styles.subtitle}>
          Take or choose a shelf photo, then detect individual book spines before OCR.
        </Text>
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Detection service</Text>
          <Text style={styles.bannerText}>{DETECTION_API_BASE_URL}</Text>
          <Text style={[styles.bannerTitle, styles.bannerTitleSecondary]}>Current OCR mode</Text>
          <Text style={styles.bannerText}>
            {ocrAvailability.available
              ? "Native ML Kit OCR is available in this build."
              : ocrAvailability.reason}
          </Text>
        </View>

        <View style={styles.card}>
          <View
            style={styles.previewStage}
            onLayout={(event) => setPreviewLayout(event.nativeEvent.layout)}
          >
            {selectedImage && previewFrame ? (
              <>
                <Image
                  source={{ uri: selectedImage.uri }}
                  style={[
                    styles.previewImage,
                    {
                      left: previewFrame.x,
                      top: previewFrame.y,
                      width: previewFrame.width,
                      height: previewFrame.height
                    }
                  ]}
                />
                {detectedRegions.map((region, index) => (
                  <View
                    key={region.id ?? `region-${index}`}
                    pointerEvents="none"
                    style={[styles.detectionBox, getDetectionBoxStyle(region, previewFrame)]}
                  >
                    <Text style={styles.detectionLabel}>
                      {index + 1} | {Math.round((region.confidence ?? 0) * 100)}%
                    </Text>
                  </View>
                ))}
              </>
            ) : (
              <View style={styles.placeholder}>
                <Text style={styles.placeholderTitle}>No shelf image yet</Text>
                <Text style={styles.placeholderText}>
                  Use the camera in the app or choose a photo from the library.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.buttonRow}>
            <Pressable onPress={openCamera} style={[styles.button, styles.primaryButton]}>
              <Text style={styles.primaryButtonText}>Take Photo</Text>
            </Pressable>
            <Pressable onPress={openLibrary} style={[styles.button, styles.secondaryButton]}>
              <Text style={styles.secondaryButtonText}>Choose Photo</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={handleDetect}
            disabled={isDetecting || isAnalyzing}
            style={[
              styles.button,
              styles.uploadButton,
              (isDetecting || isAnalyzing) && styles.disabledButton
            ]}
          >
            <Text style={styles.uploadButtonText}>
              {isDetecting || isAnalyzing ? "Detecting and Reading..." : "Detect Book Spines"}
            </Text>
          </Pressable>

          {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
          {detectionDebug ? (
            <Text style={styles.debugMeta}>
              Model: {detectionDebug.modelVersion ?? "unknown"} | Processing:{" "}
              {detectionDebug.processingMs ?? 0} ms | Boxes: {detectedRegions.length}
            </Text>
          ) : null}

          {spineResults.length ? (
            <View style={styles.resultsSection}>
              <Text style={styles.resultsTitle}>Detected spines</Text>
              {spineResults.map((spine, index) => (
                <View key={spine.id ?? `spine-${index}`} style={styles.resultRow}>
                  <Text style={styles.resultIndex}>{index + 1}</Text>
                  <View style={styles.resultContent}>
                    <Text style={styles.resultText}>
                      Confidence: {Math.round((spine.confidence ?? 0) * 100)}%
                    </Text>
                    <Text style={styles.resultMeta}>{spine.message}</Text>
                    {spine.textCandidates?.length ? (
                      spine.textCandidates.map((candidate, candidateIndex) => (
                        <Text
                          key={`${candidate.text}-${candidateIndex}`}
                          style={styles.candidateText}
                        >
                          {candidate.text}
                        </Text>
                      ))
                    ) : (
                      <Text style={styles.resultMeta}>
                        {spine.rawText || "No OCR text returned for this spine."}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F4E8D5"
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 32,
    backgroundColor: "#F4E8D5"
  },
  eyebrow: {
    marginBottom: 8,
    color: "#8B5E3C",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase"
  },
  title: {
    color: "#2E241B",
    fontSize: 32,
    fontWeight: "800",
    lineHeight: 38
  },
  subtitle: {
    marginTop: 12,
    marginBottom: 18,
    color: "#5E5147",
    fontSize: 16,
    lineHeight: 24
  },
  banner: {
    marginBottom: 18,
    borderRadius: 20,
    padding: 16,
    backgroundColor: "#EFE1CC"
  },
  bannerTitle: {
    marginBottom: 6,
    color: "#5C402B",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase"
  },
  bannerTitleSecondary: {
    marginTop: 12
  },
  bannerText: {
    color: "#5E5147",
    fontSize: 14,
    lineHeight: 20
  },
  card: {
    borderRadius: 28,
    padding: 18,
    backgroundColor: "#FFF9F2",
    shadowColor: "#2E241B",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3
  },
  placeholder: {
    minHeight: 320,
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#D4B895",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#F8EEDC"
  },
  placeholderTitle: {
    marginBottom: 8,
    color: "#2E241B",
    fontSize: 20,
    fontWeight: "700"
  },
  placeholderText: {
    color: "#6A5A4B",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center"
  },
  previewStage: {
    minHeight: 360,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#E6D7C4"
  },
  previewImage: {
    position: "absolute",
    borderRadius: 0,
    backgroundColor: "#E6D7C4"
  },
  detectionBox: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "#2F6B5D",
    backgroundColor: "rgba(47, 107, 93, 0.1)"
  },
  detectionLabel: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: "#2F6B5D",
    color: "#FFFDF9",
    fontSize: 11,
    fontWeight: "800"
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 18
  },
  button: {
    minHeight: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryButton: {
    flex: 1,
    backgroundColor: "#2F6B5D"
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#2F6B5D",
    backgroundColor: "#F5F0E8"
  },
  uploadButton: {
    marginTop: 12,
    backgroundColor: "#B04A2B"
  },
  disabledButton: {
    opacity: 0.6
  },
  primaryButtonText: {
    color: "#FFFDF9",
    fontSize: 16,
    fontWeight: "700"
  },
  secondaryButtonText: {
    color: "#214F45",
    fontSize: 16,
    fontWeight: "700"
  },
  uploadButtonText: {
    color: "#FFF7F0",
    fontSize: 16,
    fontWeight: "700"
  },
  statusText: {
    marginTop: 10,
    color: "#8A361C",
    fontSize: 14,
    fontWeight: "600"
  },
  resultsSection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E4D5BF",
    paddingTop: 16
  },
  resultsTitle: {
    marginBottom: 10,
    color: "#2E241B",
    fontSize: 18,
    fontWeight: "700"
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8
  },
  resultContent: {
    flex: 1
  },
  resultIndex: {
    minWidth: 24,
    color: "#8B5E3C",
    fontSize: 14,
    fontWeight: "800"
  },
  resultText: {
    flex: 1,
    color: "#3D3025",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700"
  },
  resultMeta: {
    marginTop: 4,
    color: "#7A6A5C",
    fontSize: 13,
    lineHeight: 18
  },
  candidateText: {
    marginTop: 8,
    color: "#3D3025",
    fontSize: 15,
    lineHeight: 21
  },
  debugMeta: {
    marginTop: 10,
    color: "#6A5A4B",
    fontSize: 13,
    fontWeight: "600"
  }
});
