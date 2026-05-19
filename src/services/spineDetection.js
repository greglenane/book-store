const DEFAULT_DETECTION_API_BASE_URL = "http://10.0.2.2:8000";

export const DETECTION_API_BASE_URL =
  process.env.EXPO_PUBLIC_DETECTION_API_BASE_URL ?? DEFAULT_DETECTION_API_BASE_URL;

const getFileName = (asset) => {
  if (asset.fileName) {
    return asset.fileName;
  }

  const uriName = asset.uri?.split("/").pop();
  return uriName || "shelf-photo.jpg";
};

const getMimeType = (asset) => {
  if (asset.mimeType) {
    return asset.mimeType;
  }

  const fileName = getFileName(asset).toLowerCase();
  if (fileName.endsWith(".png")) {
    return "image/png";
  }
  if (fileName.endsWith(".webp")) {
    return "image/webp";
  }
  return "image/jpeg";
};

export const detectBookSpines = async (asset, source = "library") => {
  if (!asset?.uri) {
    throw new Error("A selected image is required before spine detection can run.");
  }

  const body = new FormData();
  body.append("image", {
    uri: asset.uri,
    name: getFileName(asset),
    type: getMimeType(asset)
  });
  body.append("source", source);

  const response = await fetch(`${DETECTION_API_BASE_URL}/image-processing/spine-detections`, {
    method: "POST",
    body
  });

  const responseText = await response.text();
  let payload = null;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.detail || "Spine detection service unavailable.");
  }

  return payload;
};
