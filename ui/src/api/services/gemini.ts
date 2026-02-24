import { GoogleGenerativeAI } from "@google/generative-ai";
import type { TextRegion } from "~/types/translator.types";

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
    this.model = this.genAI.getGenerativeModel({ model: PRIMARY_MODEL });
    this.fallbackModel = this.genAI.getGenerativeModel({ model: FALLBACK_MODEL });
    this.usingFallback = false;
  }

  private getActiveModel() {
    return this.usingFallback ? this.fallbackModel : this.model;
  }

  private switchToFallback() {
    console.log(`[API] Rate limit hit on ${PRIMARY_MODEL}, switching to ${FALLBACK_MODEL}`);
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

  async translateText(
    text: string,
    targetLang: string = "en",
  ): Promise<string> {
    if (!this.model) {
      throw new Error("Gemini API not initialized. Please provide an API key.");
    }

    try {
      const prompt = `Translate the following text to ${targetLang}. Only provide the translation, no explanations:\n\n${text}`;

      const result = await this.getActiveModel().generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error("Gemini translation error:", error);
      throw error;
    }
  }

  async extractAndTranslateFromImage(
    imageData: string,
    targetLang: string = "en",
  ): Promise<{ extractedText: string; translation: string }> {
    if (!this.model) {
      throw new Error("Gemini API not initialized. Please provide an API key.");
    }

    try {
      const prompt = `Extract all text from this manga/comic image and translate it to ${targetLang}.
      Return the response in JSON format with two fields:
      - "extractedText": the original text found in the image
      - "translation": the translated text
      If no text is found, return empty strings.`;

      const imagePart = {
        inlineData: {
          data: imageData.split(",")[1],
          mimeType: "image/png",
        },
      };

      const result = await this.getActiveModel().generateContent([prompt, imagePart]);
      const response = await result.response;
      const text = response.text();

      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.warn("Failed to parse JSON, returning raw text");
      }

      return {
        extractedText: text,
        translation: text,
      };
    } catch (error) {
      console.error("Gemini image extraction error:", error);
      throw error;
    }
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
          this.switchToFallback();
          console.log(`[API] Rate limit on primary model, retrying once with fallback`);
          try {
            const value = await fn();
            return { value, wasRateLimited: true };
          } catch (fallbackError: any) {
            const userError = new Error(this.getUserFacingError(fallbackError));
            (userError as any).cause = fallbackError;
            (userError as any).isRateLimit = true;
            console.error("[API] Rate limit on fallback model, stopping");
            throw userError;
          }
        }
        const userError = new Error(this.getUserFacingError(error));
        (userError as any).cause = error;
        (userError as any).isRateLimit = true;
        console.error("[API] Rate limit hit, stopping");
        throw userError;
      }

      if (this.isRetryable(error)) {
        const delay = this.getRetryDelay(error, 0, 1000);
        console.log(`[API] Retrying after ${delay}ms due to: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        try {
          const value = await fn();
          return { value, wasRateLimited: false };
        } catch (retryError: any) {
          const userError = new Error(this.getUserFacingError(retryError));
          (userError as any).cause = retryError;
          (userError as any).isRateLimit = this.isRateLimit(retryError);
          (userError as any).isOverloaded = this.isOverloaded(retryError);
          throw userError;
        }
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
  ): Promise<{ translations: Array<{ originalText: string; translatedText: string }>; wasRateLimited: boolean }> {
    const { value, wasRateLimited } = await this.retryWithBackoff(async () => {
      const imageDescriptions = cropDataUrls
        .map((_, i) => `[Image ${i + 1} - ${bubbleTypes[i] ?? "speech"}]`)
        .join(", ");

      const prompt =
        `You are given ${cropDataUrls.length} text region image(s) from a manga page: ${imageDescriptions}. ` +
        `Images labelled "text_free" are sound effects or free-floating text outside speech bubbles — translate them naturally as onomatopoeia or effects. ` +
        `Images labelled "speech", "narration", or "tall" are dialogue/thought bubbles — extract and translate the dialogue text. ` +
        `For each image extract all text and translate it to ${targetLang}. ` +
        `Return ONLY a valid JSON array with exactly ${cropDataUrls.length} objects in the same order as the images. ` +
        `Each object must have exactly two fields: "originalText" and "translatedText". If an image has no text, use empty strings. ` +
        `Example: [{"originalText":"...","translatedText":"..."},{"originalText":"","translatedText":""}]`;

      const parts: any[] = [prompt];
      for (const dataUrl of cropDataUrls) {
        parts.push({ inlineData: { data: dataUrl.split(",")[1], mimeType: "image/png" } });
      }

      const result = await this.getActiveModel().generateContent(parts);
      this.accumulateTokens(result);
      const response = await result.response;
      const text = response.text();

      try {
        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed)) {
            return parsed.map((item: any) => ({
              originalText: item.originalText || "",
              translatedText: item.translatedText || "",
            })) as Array<{ originalText: string; translatedText: string }>;
          }
        }
      } catch {
        // fall through to per-item fallback
      }

      return cropDataUrls.map(() => ({ originalText: "", translatedText: "" }));
    });
    return { translations: value, wasRateLimited };
  }

  async extractAndTranslateFromCrops(
    cropDataUrls: string[],
    bubbleTypes: string[],
    targetLang: string = "en",
  ): Promise<{ translations: Array<{ originalText: string; translatedText: string }>; wasRateLimited: boolean }> {
    if (!this.model) {
      throw new Error("Gemini API not initialized. Please provide an API key.");
    }

    const CHUNK_SIZE = 16;
    if (cropDataUrls.length <= CHUNK_SIZE) {
      return this.extractAndTranslateChunk(cropDataUrls, bubbleTypes, targetLang);
    }

    const translations: Array<{ originalText: string; translatedText: string }> = [];
    let anyRateLimited = false;
    for (let i = 0; i < cropDataUrls.length; i += CHUNK_SIZE) {
      const urlChunk = cropDataUrls.slice(i, i + CHUNK_SIZE);
      const typeChunk = bubbleTypes.slice(i, i + CHUNK_SIZE);
      const chunk = await this.extractAndTranslateChunk(urlChunk, typeChunk, targetLang);
      translations.push(...chunk.translations);
      if (chunk.wasRateLimited) anyRateLimited = true;
    }
    return { translations, wasRateLimited: anyRateLimited };
  }

  async batchTranslate(
    texts: string[],
    targetLang: string = "en",
  ): Promise<string[]> {
    if (!this.model) {
      throw new Error("Gemini API not initialized. Please provide an API key.");
    }

    if (texts.length === 0) return [];

    try {
      const prompt = `Translate the following texts to ${targetLang}. Return ONLY a JSON array of translations in the same order, no explanations.

Texts to translate:
${texts.map((text, i) => `${i + 1}. ${text}`).join("\n")}

Return format: ["translation1", "translation2", ...]`;

      const result = await this.getActiveModel().generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      try {
        const cleanedText = text
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "");
        const jsonMatch = cleanedText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const translations = JSON.parse(jsonMatch[0]);
          return translations;
        }
      } catch (e) {
        console.warn(
          "Failed to parse batch translation response, falling back to individual translation",
        );
      }

      const translations: string[] = [];
      for (const text of texts) {
        translations.push(await this.translateText(text, targetLang));
      }
      return translations;
    } catch (error) {
      console.error("Gemini batch translation error:", error);
      throw error;
    }
  }
}

export const geminiService = new GeminiService();
