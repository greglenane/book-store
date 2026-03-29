import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import {
  getSpineRecognitionAvailability,
  recognizeBookSpines
} from "./src/services/spineRecognition";

const uploadShelfImage = async (asset) => {
  await new Promise((resolve) => setTimeout(resolve, 900));

  return {
    uri: asset.uri,
    uploadedAt: new Date().toISOString()
  };
};

const MIN_CROP_SIZE = 80;

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

const createInitialCropRect = (frame) => {
  if (!frame) {
    return null;
  }

  const width = Math.max(MIN_CROP_SIZE, frame.width * 0.72);
  const height = Math.max(MIN_CROP_SIZE, frame.height * 0.72);

  return {
    x: frame.x + (frame.width - width) / 2,
    y: frame.y + (frame.height - height) / 2,
    width,
    height
  };
};

const clampCropRect = (rect, frame) => {
  if (!rect || !frame) {
    return rect;
  }

  const width = clamp(rect.width, MIN_CROP_SIZE, frame.width);
  const height = clamp(rect.height, MIN_CROP_SIZE, frame.height);
  const x = clamp(rect.x, frame.x, frame.x + frame.width - width);
  const y = clamp(rect.y, frame.y, frame.y + frame.height - height);

  return { x, y, width, height };
};

const displayCropToSourceCrop = (rect, frame, imageSize) => {
  if (!rect || !frame || !imageSize?.width || !imageSize?.height) {
    return null;
  }

  const scaleX = imageSize.width / frame.width;
  const scaleY = imageSize.height / frame.height;

  return {
    originX: Math.round((rect.x - frame.x) * scaleX),
    originY: Math.round((rect.y - frame.y) * scaleY),
    width: Math.round(rect.width * scaleX),
    height: Math.round(rect.height * scaleY)
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

export default function App() {
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageSize, setImageSize] = useState(null);
  const [previewLayout, setPreviewLayout] = useState(null);
  const [cropRect, setCropRect] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [analysisMessage, setAnalysisMessage] = useState("");
  const [recognizedSpines, setRecognizedSpines] = useState([]);
  const [rawDetectedText, setRawDetectedText] = useState("");
  const [analysisStats, setAnalysisStats] = useState(null);
  const cropRectRef = useRef(null);
  const imageFrameRef = useRef(null);
  const moveStartRef = useRef(null);
  const topLeftStartRef = useRef(null);
  const topRightStartRef = useRef(null);
  const bottomLeftStartRef = useRef(null);
  const bottomRightStartRef = useRef(null);
  const selectedImageUriRef = useRef(null);

  useEffect(() => {
    cropRectRef.current = cropRect ? { ...cropRect } : null;
  }, [cropRect]);

  useEffect(() => {
    const frame = getRenderedImageFrame(previewLayout, imageSize);
    imageFrameRef.current = frame;

    if (!frame) {
      return;
    }

    setCropRect((current) => {
      const selectedUri = selectedImage?.uri ?? null;
      if (!current || selectedImageUriRef.current !== selectedUri) {
        const initial = createInitialCropRect(frame);
        return initial ? { ...initial } : current;
      }

      const clamped = clampCropRect(current, frame);
      return clamped ? { ...clamped } : current;
    });
  }, [previewLayout, imageSize, selectedImage]);

  const handlePickResult = async (result) => {
    if (result.canceled || !result.assets?.length) {
      return;
    }

    const asset = result.assets[0];
    selectedImageUriRef.current = asset.uri ?? null;
    setSelectedImage(asset);
    setImageSize(asset.width && asset.height ? { width: asset.width, height: asset.height } : null);
    if ((!asset.width || !asset.height) && asset.uri) {
      try {
        const size = await resolveImageSize(asset.uri);
        setImageSize(size);
      } catch (error) {
        setImageSize(null);
      }
    }
    setCropRect(null);
    setUploadMessage("");
    setAnalysisMessage("");
    setRecognizedSpines([]);
    setRawDetectedText("");
    setAnalysisStats(null);
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

    await handlePickResult(result);
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

    await handlePickResult(result);
  };

  const analyzeSelectedImage = async (asset = selectedImage) => {
    try {
      const result = await recognizeBookSpines(asset);
      if (!result.available) {
        setRecognizedSpines([]);
        setRawDetectedText("");
        setAnalysisStats(null);
        setAnalysisMessage(result.reason);
        return;
      }

      setRecognizedSpines(result.spines);
      setRawDetectedText(result.rawText);
      setAnalysisStats(result.debug ?? null);
      setAnalysisMessage(
        result.spines.length
          ? `Detected ${result.spines.length} spine text candidate${result.spines.length === 1 ? "" : "s"}.`
          : result.rawText
            ? "OCR found text, but no strong spine-title candidates passed filtering. Try a tighter crop."
            : "No text was detected. Try a sharper, straighter shelf photo."
      );
    } catch (error) {
      setRecognizedSpines([]);
      setRawDetectedText("");
      setAnalysisStats(null);
      setAnalysisMessage("Text recognition failed. Rebuild the app if the native OCR module was just added.");
    }
  };

  const handleUpload = async () => {
    if (!selectedImage) {
      Alert.alert("No image selected", "Choose or capture a shelf photo first.");
      return;
    }

    const frame = imageFrameRef.current;
    const currentCrop = cropRectRef.current;
    const sourceCrop =
      frame && currentCrop && imageSize ? displayCropToSourceCrop(currentCrop, frame, imageSize) : null;
    const uploadAsset = sourceCrop
      ? await manipulateAsync(
          selectedImage.uri,
          [
            {
              crop: sourceCrop
            }
          ],
          {
            compress: 0.95,
            format: SaveFormat.JPEG
          }
        )
      : selectedImage;

    try {
      setIsUploading(true);
      setIsAnalyzing(true);
      setUploadMessage("");
      setAnalysisMessage("");
      const response = await uploadShelfImage(uploadAsset);
      setUploadMessage(`Uploaded shelf image at ${new Date(response.uploadedAt).toLocaleTimeString()}.`);
      await analyzeSelectedImage(uploadAsset);
    } catch (error) {
      setUploadMessage("Upload failed. Try again.");
      setRecognizedSpines([]);
      setRawDetectedText("");
      setAnalysisStats(null);
      setAnalysisMessage("Text recognition did not run because the upload step failed.");
    } finally {
      setIsUploading(false);
      setIsAnalyzing(false);
    }
  };

  const ocrAvailability = getSpineRecognitionAvailability();

  const updateCropRect = (nextRect) => {
    const frame = imageFrameRef.current;
    if (!frame) {
      return;
    }

    setCropRect((current) => {
      const base = typeof nextRect === "function" ? nextRect(current) : nextRect;
      if (!base) {
        return current;
      }

      const clamped = clampCropRect(base, frame);
      cropRectRef.current = clamped ? { ...clamped } : null;
      return clamped ? { ...clamped } : current;
    });
  };

  const moveResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: () => {
      moveStartRef.current = cropRectRef.current ? { ...cropRectRef.current } : null;
    },
    onPanResponderMove: (_, gestureState) => {
      const frame = imageFrameRef.current;
      const start = moveStartRef.current;
      if (!frame || !start) {
        return;
      }

      updateCropRect({
        x: start.x + gestureState.dx,
        y: start.y + gestureState.dy,
        width: start.width,
        height: start.height
      });
    },
    onPanResponderRelease: () => {
      moveStartRef.current = null;
    }
  });

  const createCornerResponder = (corner) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        const current = cropRectRef.current ? { ...cropRectRef.current } : null;
        if (corner === "topLeft") {
          topLeftStartRef.current = current;
        }
        if (corner === "topRight") {
          topRightStartRef.current = current;
        }
        if (corner === "bottomLeft") {
          bottomLeftStartRef.current = current;
        }
        if (corner === "bottomRight") {
          bottomRightStartRef.current = current;
        }
      },
      onPanResponderMove: (_, gestureState) => {
        const frame = imageFrameRef.current;
        if (!frame) {
          return;
        }

        const start =
          corner === "topLeft"
            ? topLeftStartRef.current
            : corner === "topRight"
              ? topRightStartRef.current
              : corner === "bottomLeft"
                ? bottomLeftStartRef.current
                : bottomRightStartRef.current;

        if (!start) {
          return;
        }

        let next = { ...start };

        if (corner === "topLeft") {
          next.x = start.x + gestureState.dx;
          next.y = start.y + gestureState.dy;
          next.width = start.width - gestureState.dx;
          next.height = start.height - gestureState.dy;
        } else if (corner === "topRight") {
          next.y = start.y + gestureState.dy;
          next.width = start.width + gestureState.dx;
          next.height = start.height - gestureState.dy;
        } else if (corner === "bottomLeft") {
          next.x = start.x + gestureState.dx;
          next.width = start.width - gestureState.dx;
          next.height = start.height + gestureState.dy;
        } else {
          next.width = start.width + gestureState.dx;
          next.height = start.height + gestureState.dy;
        }

        updateCropRect(next);
      },
      onPanResponderRelease: () => {
        if (corner === "topLeft") {
          topLeftStartRef.current = null;
        }
        if (corner === "topRight") {
          topRightStartRef.current = null;
        }
        if (corner === "bottomLeft") {
          bottomLeftStartRef.current = null;
        }
        if (corner === "bottomRight") {
          bottomRightStartRef.current = null;
        }
      }
    });

  const topLeftResponder = createCornerResponder("topLeft");
  const topRightResponder = createCornerResponder("topRight");
  const bottomLeftResponder = createCornerResponder("bottomLeft");
  const bottomRightResponder = createCornerResponder("bottomRight");

  const previewFrame = getRenderedImageFrame(previewLayout, imageSize);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>Book discovery from the shelf</Text>
        <Text style={styles.title}>Bookshelf Scanner</Text>
        <Text style={styles.subtitle}>
          Take or choose a photo, then crop to the shelf area before upload.
        </Text>
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Current OCR mode</Text>
          <Text style={styles.bannerText}>
            {ocrAvailability.available
              ? "Native ML Kit spine reading is available in this build."
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
                {cropRect ? (
                  <View
                    pointerEvents="box-none"
                    style={[
                      styles.cropBox,
                      {
                        left: cropRect.x,
                        top: cropRect.y,
                        width: cropRect.width,
                        height: cropRect.height
                      }
                    ]}
                  >
                    <View pointerEvents="none" style={styles.cropOverlay} />
                    <View style={styles.cropMoveArea} {...moveResponder.panHandlers} />
                    <View
                      style={[styles.handle, styles.handleTopLeft]}
                      {...topLeftResponder.panHandlers}
                    />
                    <View
                      style={[styles.handle, styles.handleTopRight]}
                      {...topRightResponder.panHandlers}
                    />
                    <View
                      style={[styles.handle, styles.handleBottomLeft]}
                      {...bottomLeftResponder.panHandlers}
                    />
                    <View
                      style={[styles.handle, styles.handleBottomRight]}
                      {...bottomRightResponder.panHandlers}
                    />
                  </View>
                ) : null}
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
          {selectedImage ? (
            <Text style={styles.cropHint}>
              Drag the box to move it. Drag a corner to resize the crop area.
            </Text>
          ) : null}

          <View style={styles.buttonRow}>
            <Pressable onPress={openCamera} style={[styles.button, styles.primaryButton]}>
              <Text style={styles.primaryButtonText}>Take Photo</Text>
            </Pressable>
            <Pressable onPress={openLibrary} style={[styles.button, styles.secondaryButton]}>
              <Text style={styles.secondaryButtonText}>Choose Photo</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={handleUpload}
            disabled={isUploading || isAnalyzing}
            style={[
              styles.button,
              styles.uploadButton,
              (isUploading || isAnalyzing) && styles.disabledButton
            ]}
          >
            <Text style={styles.uploadButtonText}>
              {isUploading || isAnalyzing ? "Uploading and Reading..." : "Upload Bookshelf"}
            </Text>
          </Pressable>

          {analysisMessage ? <Text style={styles.statusText}>{analysisMessage}</Text> : null}
          {recognizedSpines.length ? (
            <View style={styles.resultsSection}>
              <Text style={styles.resultsTitle}>Detected spine text</Text>
              {recognizedSpines.map((spine, index) => (
                <View key={`${spine.text}-${index}`} style={styles.resultRow}>
                  <Text style={styles.resultIndex}>{index + 1}</Text>
                  <View style={styles.resultContent}>
                    <Text style={styles.resultText}>{spine.text}</Text>
                    <Text style={styles.resultMeta}>
                      OCR score: {spine.score?.toFixed?.(1) ?? spine.score ?? "n/a"}
                    </Text>
                    {spine.sourceRotation !== undefined ? (
                      <Text style={styles.resultMeta}>Source rotation: {spine.sourceRotation} deg</Text>
                    ) : null}
                    {spine.sourceParts?.length ? (
                      <Text style={styles.resultMeta}>
                        Source parts: {spine.sourceParts.join(" | ")}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          {analysisStats || rawDetectedText ? (
            <View style={styles.resultsSection}>
              <Text style={styles.resultsTitle}>OCR debug output</Text>
              {analysisStats ? (
                <Text style={styles.debugMeta}>
                  Variants: {analysisStats.variantCount ?? 0} | Best rotation: {analysisStats.bestRotation ?? 0} |
                  Blocks: {analysisStats.blockCount} | Lines: {analysisStats.lineCount} |
                  Filtered: {analysisStats.filteredLineCount ?? 0} | Candidates: {analysisStats.candidateCount ?? 0}
                </Text>
              ) : null}
              <View style={styles.rawTextBox}>
                <Text style={styles.rawTextValue}>
                  {rawDetectedText || "OCR ran, but no raw text was returned."}
                </Text>
              </View>
            </View>
          ) : null}
          {uploadMessage ? <Text style={styles.statusText}>{uploadMessage}</Text> : null}
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
  cropHint: {
    marginTop: 10,
    color: "#6A5A4B",
    fontSize: 13,
    lineHeight: 18
  },
  cropBox: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "#F4E8D5"
  },
  cropOverlay: {
    flex: 1,
    backgroundColor: "rgba(47, 107, 93, 0.08)"
  },
  cropMoveArea: {
    position: "absolute",
    left: 30,
    right: 30,
    top: 30,
    bottom: 30
  },
  handle: {
    position: "absolute",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFDF9",
    borderWidth: 2,
    borderColor: "#2F6B5D",
    zIndex: 3
  },
  handleTopLeft: {
    left: -18,
    top: -18
  },
  handleTopRight: {
    right: -18,
    top: -18
  },
  handleBottomLeft: {
    left: -18,
    bottom: -18
  },
  handleBottomRight: {
    right: -18,
    bottom: -18
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
  helperText: {
    marginTop: 14,
    color: "#6A5A4B",
    fontSize: 14,
    lineHeight: 20
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
    lineHeight: 22
  },
  resultMeta: {
    marginTop: 4,
    color: "#7A6A5C",
    fontSize: 13,
    lineHeight: 18
  },
  debugMeta: {
    marginBottom: 10,
    color: "#6A5A4B",
    fontSize: 14,
    fontWeight: "600"
  },
  rawTextBox: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#F5EFE6",
    borderWidth: 1,
    borderColor: "#E4D5BF"
  },
  rawTextValue: {
    color: "#3D3025",
    fontSize: 14,
    lineHeight: 21
  }
});
