export { GeminiService, geminiService } from "./gemini"
export { OpenAIService, openaiService } from "./openai"

export type TranslationProvider = "gemini" | "openai"

export interface TranslationConfig {
  provider: TranslationProvider
  apiKey: string
  targetLanguage: string
}

export interface TranslationResult {
  extractedText: string
  translation: string
  provider: TranslationProvider
  timestamp: number
}
