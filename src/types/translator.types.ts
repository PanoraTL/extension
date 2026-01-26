// Core translation types for the manga translator extension

export type TranslationMode = "manual" | "auto" | "idle"

export type TranslationStatus = "idle" | "selecting" | "processing" | "complete" | "error"

// Image detection types
export interface DetectedImage {
  id: string // Unique identifier for the image
  element: HTMLImageElement
  src: string
  dataUrl: string // Base64 encoded image data
  bounds: DOMRect
  visible: boolean
}

// Text region with translation
export interface TextRegion {
  originalText: string
  translatedText: string
  bounds: BoundingBox
  background: BackgroundInfo
  confidence: number
}

// Bounding box with percentage-based coordinates
export interface BoundingBox {
  x: number // Percentage (0-100) of image width
  y: number // Percentage (0-100) of image height
  width: number // Percentage (0-100) of image width
  height: number // Percentage (0-100) of image height
}

// Background information for speech bubbles
export interface BackgroundInfo {
  type: "solid" | "pattern"
  color: string // Hex color code
  hasTexture?: boolean
}

// Translation result from background service
export interface TranslationResult {
  imageId: string
  textRegions: TextRegion[]
  cached: boolean
  error?: string
}

// Settings for translation
export interface TranslationSettings {
  autoDetectLanguage: boolean
  showOriginalText: boolean
  targetLanguage: string // Default: "en"
  useGPTTranslation: boolean // Whether to use GPT-4o Mini for translation
}

// Message types for chrome.runtime communication

// Popup → Content Script messages
export interface StartTranslationMessage {
  action: "START_TRANSLATION"
  mode: "manual" | "auto"
  settings: TranslationSettings
}

export interface StopTranslationMessage {
  action: "STOP_TRANSLATION"
}

export interface ToggleOverlaysMessage {
  action: "TOGGLE_OVERLAYS"
  show: boolean
}

// Content Script → Background messages
export interface ProcessImagesMessage {
  action: "PROCESS_IMAGES"
  images: Array<{
    id: string
    dataUrl: string
    bounds: DOMRect
  }>
  targetLang: string
  tabId?: number
}

export interface CheckCacheMessage {
  action: "CHECK_CACHE"
  images: Array<{
    id: string
    dataUrl: string
  }>
}

export interface FetchImageMessage {
  action: "FETCH_IMAGE"
  url: string
}

// Background → Content Script messages
export interface TranslationResultMessage {
  action: "TRANSLATION_RESULT"
  results: TranslationResult[]
}

export interface ProgressUpdateMessage {
  action: "PROGRESS_UPDATE"
  current: number
  total: number
  status: TranslationStatus
}

export interface ErrorMessage {
  action: "ERROR"
  error: string
  details?: any
}

export interface CacheResultMessage {
  action: "CACHE_RESULT"
  cached: Record<string, TextRegion[]>
}

export interface ImageFetchResultMessage {
  action: "IMAGE_FETCH_RESULT"
  dataUrl: string
  error?: string
}

// Content Script → Popup messages
export type ContentToPopupMessage = ProgressUpdateMessage | ErrorMessage

// Union types for message handling
export type PopupMessage = StartTranslationMessage | StopTranslationMessage | ToggleOverlaysMessage

export type ContentScriptMessage = ProcessImagesMessage | CheckCacheMessage | FetchImageMessage

export type BackgroundMessage =
  | TranslationResultMessage
  | ProgressUpdateMessage
  | ErrorMessage
  | CacheResultMessage
  | ImageFetchResultMessage

// State types for content script
export interface TranslatorState {
  mode: TranslationMode
  status: TranslationStatus
  selectedArea: DOMRect | null
  detectedImages: Map<string, DetectedImage>
  translations: Map<string, TextRegion[]>
  overlays: Map<string, any> // Will be typed with actual overlay class
  progress: {
    current: number
    total: number
  }
  error: string | null
  settings: TranslationSettings
  showOverlays: boolean
}

// Actions for translator reducer
export type TranslatorAction =
  | { type: "START_SELECTION"; mode: "manual" | "auto"; settings: TranslationSettings }
  | { type: "AREA_SELECTED"; bounds: DOMRect }
  | { type: "CANCEL_SELECTION" }
  | { type: "IMAGES_DETECTED"; images: DetectedImage[] }
  | { type: "TRANSLATION_RECEIVED"; imageId: string; regions: TextRegion[] }
  | { type: "PROGRESS_UPDATE"; current: number; total: number }
  | { type: "SET_STATUS"; status: TranslationStatus }
  | { type: "ERROR"; error: string }
  | { type: "TOGGLE_OVERLAYS"; show: boolean }
  | { type: "RESET" }

// Cache entry structure
export interface CacheEntry {
  data: TextRegion[]
  timestamp: number
  hits: number
  imageUrl?: string
}

// Request queue item
export interface QueueItem {
  id: string
  execute: () => Promise<any>
  priority: number
  retries: number
}
