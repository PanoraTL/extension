import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const PRIMARY_MODEL = "gemini-2.5-flash-lite";
const FALLBACK_MODEL = "gemini-2.5-flash";

export class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;
  private fallbackModel: any = null;
  private usingFallback = false;
  public totalInputTokens = 0;
  public totalOutputTokens = 0;

  constructor(apiKey?: string) {
    if (apiKey) {
      this.initialize(apiKey);
    }
  }

  initialize(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    const generationConfig = {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            index: { type: SchemaType.INTEGER },
            translation: { type: SchemaType.STRING },
          },
          required: ["index", "translation"],
        },
      },
    };
    this.model = this.genAI.getGenerativeModel({ model: PRIMARY_MODEL, generationConfig });
    this.fallbackModel = this.genAI.getGenerativeModel({ model: FALLBACK_MODEL, generationConfig });
    this.usingFallback = false;
  }

  private getActiveModel() {
    return this.usingFallback ? this.fallbackModel : this.model;
  }

  private switchToFallback() {
    this.usingFallback = true;
  }

  resetTokenCount() {
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
  }

  clear() {
    this.genAI = null;
    this.model = null;
    this.fallbackModel = null;
    this.usingFallback = false;
  }

  isInitialized(): boolean {
    return this.model !== null;
  }

  isRateLimit(error: any): boolean {
    const msg = (error.message || "").toLowerCase();
    const status = error.status || error.statusCode || 0;
    return (
      status === 429 ||
      msg.includes("429") ||
      msg.includes("rate limit") ||
      msg.includes("quota") ||
      msg.includes("resource_exhausted") ||
      msg.includes("resource exhausted")
    );
  }

  private isRetryable(error: any): boolean {
    const msg = (error.message || "").toLowerCase();
    const status = error.status || error.statusCode || 0;

    if (
      status === 429 ||
      msg.includes("429") ||
      msg.includes("rate limit") ||
      msg.includes("quota")
    ) {
      return true;
    }
    if (
      status === 503 ||
      msg.includes("503") ||
      msg.includes("overloaded") ||
      msg.includes("unavailable") ||
      msg.includes("failed to fetch")
    ) {
      return true;
    }
    if (
      msg.includes("resource_exhausted") ||
      msg.includes("resource exhausted")
    ) {
      return true;
    }
    return false;
  }

  isOverloaded(error: any): boolean {
    const msg = (error.message || "").toLowerCase();
    const status = error.status || error.statusCode || 0;
    return status === 503 || msg.includes("503") || msg.includes("overloaded") || msg.includes("high demand");
  }

  private getRetryDelay(
    error: any,
    attempt: number,
    baseDelay: number,
  ): number {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("429") || msg.includes("rate limit")) {
      return Math.min(baseDelay * Math.pow(2, attempt + 1), 60000);
    }
    return baseDelay * Math.pow(2, attempt);
  }

  private getUserFacingError(error: any): string {
    const msg = (error.message || "").toLowerCase();
    const status = error.status || error.statusCode || 0;

    if (
      status === 401 ||
      msg.includes("unauthenticated") ||
      msg.includes("invalid api key") ||
      msg.includes("api key not valid") ||
      msg.includes("api_key_invalid")
    ) {
      return "Invalid API key. Please check your Gemini API key in the extension settings.";
    }
    if (status === 403 || msg.includes("permission denied")) {
      return "API key lacks permission. Your Gemini API key may be restricted or the project quota is permanently exhausted.";
    }
    if (status === 503 || msg.includes("503") || msg.includes("overloaded") || (msg.includes("unavailable") && !msg.includes("server"))) {
      return "Gemini is experiencing high demand. Translation stopped — please try again in a moment.";
    }
    if (status === 429 || msg.includes("rate limit")) {
      return "Gemini API rate limit reached. Please wait a moment and try again.";
    }
    if (
      msg.includes("resource_exhausted") ||
      msg.includes("resource exhausted") ||
      msg.includes("quota")
    ) {
      return "Gemini API quota exhausted. You may need to upgrade your plan or wait for the quota to reset.";
    }
    if (status === 400 || msg.includes("invalid argument")) {
      return "Invalid request sent to Gemini API. The image may be corrupted or in an unsupported format.";
    }
    if (msg.includes("block") || msg.includes("safety")) {
      return "Gemini blocked this image due to safety filters. Try a different image.";
    }
    return error.message || "Unknown Gemini API error";
  }

  private accumulateTokens(result: any) {
    const usage = result?.response?.usageMetadata;
    if (!usage) return;
    if (typeof usage.promptTokenCount === "number") this.totalInputTokens += usage.promptTokenCount;
    if (typeof usage.candidatesTokenCount === "number") this.totalOutputTokens += usage.candidatesTokenCount;
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
  ): Promise<{ value: T; wasRateLimited: boolean }> {
    try {
      const value = await fn();
      return { value, wasRateLimited: false };
    } catch (error: any) {
      if (this.isRateLimit(error)) {
        if (!this.usingFallback) {
          console.warn(`[API] Rate limit on ${PRIMARY_MODEL}, retrying with ${FALLBACK_MODEL}`);
          this.switchToFallback();
          try {
            const value = await fn();
            return { value, wasRateLimited: true };
          } catch (fallbackError: any) {
            const userError = new Error(this.getUserFacingError(fallbackError));
            (userError as any).cause = fallbackError;
            (userError as any).isRateLimit = true;
            throw userError;
          }
        }
        const userError = new Error(this.getUserFacingError(error));
        (userError as any).cause = error;
        (userError as any).isRateLimit = true;
        throw userError;
      }

      if (this.isRetryable(error)) {
        const maxRetries = this.isOverloaded(error) ? 2 : 1;
        let lastError: any = error;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          const delay = this.isOverloaded(lastError) ? 1000 : this.getRetryDelay(lastError, attempt, 1000);
          console.warn(`[API] Retrying (${attempt + 1}/${maxRetries}) after ${delay}ms — ${lastError.message}`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          try {
            const value = await fn();
            return { value, wasRateLimited: false };
          } catch (retryError: any) {
            lastError = retryError;
            if (!this.isRetryable(retryError)) break;
          }
        }
        const userError = new Error(this.getUserFacingError(lastError));
        (userError as any).cause = lastError;
        (userError as any).isRateLimit = this.isRateLimit(lastError);
        (userError as any).isOverloaded = this.isOverloaded(lastError);
        throw userError;
      }

      const userError = new Error(this.getUserFacingError(error));
      (userError as any).cause = error;
      console.error("[API] Non-retryable error:", error.message);
      throw userError;
    }
  }

  private async extractAndTranslateChunk(
    cropDataUrls: string[],
    bubbleTypes: string[],
    targetLang: string,
  ): Promise<{ translations: string[]; wasRateLimited: boolean }> {
    const { value, wasRateLimited } = await this.retryWithBackoff(async () => {
      const imageDescriptions = cropDataUrls
        .map((_, i) => `[Image ${i + 1} - ${bubbleTypes[i] ?? "speech"}]`)
        .join(", ");

      const prompt =
        `You are given ${cropDataUrls.length} text region image(s) from a manga page: ${imageDescriptions}. ` +
        `Images labelled "text_free" are sound effects or free-floating text outside speech bubbles — translate them naturally as onomatopoeia or effects. ` +
        `Images labelled "speech", "narration", or "tall" are dialogue/thought bubbles — extract and translate the dialogue text. ` +
        `Return an array of exactly ${cropDataUrls.length} objects, each with "index" (0-based, matching the image order) and "translation" (the translated text in ${targetLang}). ` +
        `The translation MUST always be in ${targetLang}, never in the source language. Use an empty string for "translation" if the image has no readable text.`;

      const parts: any[] = [prompt];
      for (const dataUrl of cropDataUrls) {
        parts.push({ inlineData: { data: dataUrl.split(",")[1], mimeType: "image/png" } });
      }

      const result = await this.getActiveModel().generateContent(parts);
      this.accumulateTokens(result);
      const response = await result.response;
      const parsed = JSON.parse(response.text()) as { index: number; translation: string }[];
      const ordered = new Array<string>(cropDataUrls.length).fill("");
      for (const item of parsed) {
        if (item.index >= 0 && item.index < cropDataUrls.length) {
          ordered[item.index] = typeof item.translation === "string" ? item.translation : "";
        }
      }
      const emptyCount = ordered.filter((r) => !r).length;
      if (emptyCount > 0) console.warn(`[API] ${emptyCount}/${ordered.length} crops had no text`);
      return ordered;
    });
    return { translations: value, wasRateLimited };
  }

  async extractAndTranslateFromCrops(
    cropDataUrls: string[],
    bubbleTypes: string[],
    targetLang: string = "en",
  ): Promise<{ translations: string[]; wasRateLimited: boolean }> {
    if (!this.model) {
      throw new Error("Gemini API not initialized. Please provide an API key.");
    }

    const CHUNK_SIZE = 6;
    const CONCURRENCY = 5;
    const chunks: Array<{ urls: string[]; types: string[]; index: number }> = [];
    for (let i = 0; i < cropDataUrls.length; i += CHUNK_SIZE) {
      chunks.push({ urls: cropDataUrls.slice(i, i + CHUNK_SIZE), types: bubbleTypes.slice(i, i + CHUNK_SIZE), index: chunks.length });
    }

    const results: Array<{ translations: string[]; wasRateLimited: boolean }> = new Array(chunks.length);
    let anyRateLimited = false;

    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const batch = chunks.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (chunk) => {
        const result = await this.extractAndTranslateChunk(chunk.urls, chunk.types, targetLang);
        results[chunk.index] = result;
      }));
    }

    const translations: string[] = [];
    for (const r of results) {
      translations.push(...r.translations);
      if (r.wasRateLimited) anyRateLimited = true;
    }
    return { translations, wasRateLimited: anyRateLimited };
  }

}

export const geminiService = new GeminiService();
