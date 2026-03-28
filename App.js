import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
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

export default function App() {
  const [selectedImage, setSelectedImage] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [analysisMessage, setAnalysisMessage] = useState("");
  const [recognizedSpines, setRecognizedSpines] = useState([]);
  const [rawDetectedText, setRawDetectedText] = useState("");
  const [analysisStats, setAnalysisStats] = useState(null);

  const handlePickResult = (result) => {
    if (result.canceled || !result.assets?.length) {
      return;
    }

    setSelectedImage(result.assets[0]);
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

    handlePickResult(result);
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

    handlePickResult(result);
  };

  const handleUpload = async () => {
    if (!selectedImage) {
      Alert.alert("No image selected", "Choose or capture a shelf photo first.");
      return;
    }

    try {
      setIsUploading(true);
      const response = await uploadShelfImage(selectedImage);
      setUploadMessage(`Uploaded shelf image at ${new Date(response.uploadedAt).toLocaleTimeString()}.`);
    } catch (error) {
      setUploadMessage("Upload failed. Try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleReadSpines = async () => {
    if (!selectedImage) {
      Alert.alert("No image selected", "Choose or capture a shelf photo first.");
      return;
    }

    try {
      setIsAnalyzing(true);
      setAnalysisMessage("");

      const result = await recognizeBookSpines(selectedImage);
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
            ? "OCR found text, but no strong spine-title candidates passed filtering."
            : "No text was detected. Try a sharper, straighter shelf photo."
      );
    } catch (error) {
      setRecognizedSpines([]);
      setRawDetectedText("");
      setAnalysisStats(null);
      setAnalysisMessage("Text recognition failed. Rebuild the app if the native OCR module was just added.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const ocrAvailability = getSpineRecognitionAvailability();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>Book discovery from the shelf</Text>
        <Text style={styles.title}>Capture or select a shelf photo</Text>
        <Text style={styles.subtitle}>
          Start with a clear image of the books in front of you. This intake flow will feed the
          recognition and recommendation pipeline.
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
          {selectedImage ? (
            <Image source={{ uri: selectedImage.uri }} style={styles.previewImage} />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderTitle}>No shelf image yet</Text>
              <Text style={styles.placeholderText}>
                Use the camera in the app or choose a photo from the library.
              </Text>
            </View>
          )}

          <View style={styles.buttonRow}>
            <Pressable onPress={openCamera} style={[styles.button, styles.primaryButton]}>
              <Text style={styles.primaryButtonText}>Take Photo</Text>
            </Pressable>
            <Pressable onPress={openLibrary} style={[styles.button, styles.secondaryButton]}>
              <Text style={styles.secondaryButtonText}>Choose Photo</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={handleReadSpines}
            disabled={isAnalyzing}
            style={[styles.button, styles.analysisButton, isAnalyzing && styles.disabledButton]}
          >
            <Text style={styles.analysisButtonText}>
              {isAnalyzing ? "Reading Spines..." : "Read Book Spines"}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleUpload}
            disabled={isUploading}
            style={[styles.button, styles.uploadButton, isUploading && styles.disabledButton]}
          >
            <Text style={styles.uploadButtonText}>
              {isUploading ? "Uploading..." : "Upload for Processing"}
            </Text>
          </Pressable>

          <Text style={styles.helperText}>
            Best results come from a straight-on shelf photo with readable spines and even lighting.
          </Text>
          {analysisMessage ? <Text style={styles.statusText}>{analysisMessage}</Text> : null}
          {recognizedSpines.length ? (
            <View style={styles.resultsSection}>
              <Text style={styles.resultsTitle}>Detected spine text</Text>
              {recognizedSpines.map((spine, index) => (
                <View key={`${spine.text}-${index}`} style={styles.resultRow}>
                  <Text style={styles.resultIndex}>{index + 1}</Text>
                  <Text style={styles.resultText}>{spine.text}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {analysisStats || rawDetectedText ? (
            <View style={styles.resultsSection}>
              <Text style={styles.resultsTitle}>OCR debug output</Text>
              {analysisStats ? (
                <Text style={styles.debugMeta}>
                  Blocks: {analysisStats.blockCount} | Lines: {analysisStats.lineCount}
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
  previewImage: {
    width: "100%",
    height: 360,
    borderRadius: 20,
    backgroundColor: "#E6D7C4"
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
  analysisButton: {
    marginTop: 12,
    backgroundColor: "#7C5CFA"
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
  analysisButtonText: {
    color: "#F8F3FF",
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
