export type TranslationMode = "manual" | "auto" | "idle";

export type TranslationStatus =
  | "idle"
  | "selecting"
  | "processing"
  | "complete"
  | "error";

export interface DetectedImage {
  id: string;
  element: HTMLImageElement;
  src: string;
  dataUrl: string;
  bounds: DOMRect;
  visible: boolean;
}

export interface TextRegion {
  hasText: boolean;
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

export interface TranslationResult {
  imageId: string;
  textRegions: TextRegion[];
  cached: boolean;
  error?: string;
}

export interface TranslationSettings {
  autoDetectLanguage: boolean;
  showOriginalText: boolean;
  targetLanguage: string;
}

export interface StartTranslationMessage {
  action: "START_TRANSLATION";
  mode: "manual" | "auto";
  settings: TranslationSettings;
}

export interface StopTranslationMessage {
  action: "STOP_TRANSLATION";
}

export interface ToggleOverlaysMessage {
  action: "TOGGLE_OVERLAYS";
  show: boolean;
}

export interface ProcessImagesMessage {
  action: "PROCESS_IMAGES";
  images: Array<{
    id: string;
    dataUrl: string;
    bounds: DOMRect;
  }>;
  targetLang: string;
  tabId?: number;
}

export interface CheckCacheMessage {
  action: "CHECK_CACHE";
  images: Array<{
    id: string;
    dataUrl: string;
  }>;
}

export interface FetchImageMessage {
  action: "FETCH_IMAGE";
  url: string;
}

export interface TranslationResultMessage {
  action: "TRANSLATION_RESULT";
  results: TranslationResult[];
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

export interface CacheResultMessage {
  action: "CACHE_RESULT";
  cached: Record<string, TextRegion[]>;
}

export interface ImageFetchResultMessage {
  action: "IMAGE_FETCH_RESULT";
  dataUrl: string;
  error?: string;
}

export type ContentToPopupMessage = ProgressUpdateMessage | ErrorMessage;

export type PopupMessage =
  | StartTranslationMessage
  | StopTranslationMessage
  | ToggleOverlaysMessage;

export type ContentScriptMessage =
  | ProcessImagesMessage
  | CheckCacheMessage
  | FetchImageMessage;

export type BackgroundMessage =
  | TranslationResultMessage
  | ProgressUpdateMessage
  | ErrorMessage
  | CacheResultMessage
  | ImageFetchResultMessage;

export interface TranslatorState {
  mode: TranslationMode;
  status: TranslationStatus;
  selectedArea: DOMRect | null;
  detectedImages: Map<string, DetectedImage>;
  translations: Map<string, TextRegion[]>;
  overlays: Map<string, any>;
  progress: {
    current: number;
    total: number;
  };
  error: string | null;
  settings: TranslationSettings;
  showOverlays: boolean;
}

export type TranslatorAction =
  | {
      type: "START_SELECTION";
      mode: "manual" | "auto";
      settings: TranslationSettings;
    }
  | { type: "AREA_SELECTED"; bounds: DOMRect }
  | { type: "CANCEL_SELECTION" }
  | { type: "IMAGES_DETECTED"; images: DetectedImage[] }
  | { type: "TRANSLATION_RECEIVED"; imageId: string; regions: TextRegion[] }
  | { type: "PROGRESS_UPDATE"; current: number; total: number }
  | { type: "SET_STATUS"; status: TranslationStatus }
  | { type: "ERROR"; error: string }
  | { type: "TOGGLE_OVERLAYS"; show: boolean }
  | { type: "RESET" };

export interface DetectedBubble {
  bounds: BoundingBox;
  cropDataUrl: string;
  background: BackgroundInfo;
  detectedFontSizePct?: number;
  confidence: number;
  bubbleType?: "speech" | "narration" | "tall" | "text_free";
}

export interface CacheEntry {
  data: TextRegion[];
  timestamp: number;
  hits: number;
  imageUrl?: string;
}

export interface QueueItem {
  id: string;
  execute: () => Promise<any>;
  priority: number;
  retries: number;
}
