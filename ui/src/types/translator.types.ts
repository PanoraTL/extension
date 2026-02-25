export type TranslationStatus =
  | "idle"
  | "selecting"
  | "processing"
  | "complete"
  | "error";

export interface TextRegion {
  translatedText: string;
  bounds: BoundingBox;
  background: BackgroundInfo;
  confidence: number;
  detectedFontSizePct?: number;
  detectedFontStyle?: "bold" | "normal" | "condensed";
  bubbleType?: "speech" | "narration" | "tall" | "text_free";
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BackgroundInfo {
  type: "solid" | "pattern";
  color: string;
  hasTexture?: boolean;
}

export interface TranslationSettings {
  autoDetectLanguage: boolean;
  showOriginalText: boolean;
  targetLanguage: string;
}

export interface FetchImageMessage {
  action: "FETCH_IMAGE";
  url: string;
}

export interface ProgressUpdateMessage {
  action: "PROGRESS_UPDATE";
  current: number;
  total: number;
  status: TranslationStatus;
}

export interface ErrorMessage {
  action: "ERROR";
  error: string;
  details?: any;
}

export interface DetectedBubble {
  bounds: BoundingBox;
  cropDataUrl: string;
  background: BackgroundInfo;
  detectedFontSizePct?: number;
  confidence: number;
  bubbleType?: "speech" | "narration" | "tall" | "text_free";
}

