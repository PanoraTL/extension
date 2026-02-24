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
          throw userError;
        }
      }

      const userError = new Error(this.getUserFacingError(error));
      (userError as any).cause = error;
      console.error("[API] Non-retryable error:", error.message);
      throw userError;
    }
  }

  async detectTextRegionsWithOCR(
    imageData: string,
    targetLang: string = "en",
  ): Promise<{ regions: TextRegion[]; wasRateLimited: boolean }> {
    if (!this.model) {
      throw new Error("Gemini API not initialized. Please provide an API key.");
    }

    const { value, wasRateLimited } = await this.retryWithBackoff(async () => {
      console.log("[API] Gemini detectTextRegionsWithOCR called");

      const prompt = `You are analyzing a manga/comic image. Detect every speech bubble, thought bubble, narration box, and sound effect text region. Translate all detected text to ${targetLang}.

FOR EACH text region, output a bounding box that fits EXACTLY around the speech bubble's interior white/colored fill area. Do NOT include the black outline/border of the bubble in the box — the box should sit just inside that border. Do NOT add extra margin beyond the bubble. The goal is a tight fit around the bubble's colored interior.

If a speech bubble is partially cut off at the edge of the image (top, bottom, left, or right), report the bounding box up to the image edge. For example if a bubble extends beyond the bottom of the image, set y + height = 100.

HOW TO CALCULATE PERCENTAGE COORDINATES:
- The image spans from (0,0) at the top-left to (100,100) at the bottom-right.
- "x" = left edge of the bubble interior as % of image width
- "y" = top edge of the bubble interior as % of image height
- "width" = bubble interior width as % of image width
- "height" = bubble interior height as % of image height
- Example: a bubble whose interior spans from 10% to 40% horizontally and 20% to 35% vertically would be x:10, y:20, width:30, height:15

VERIFICATION STEP: After determining each bounding box, check:
- Does the rectangle sit INSIDE the black bubble outline, not outside it?
- Is it tight — no extra whitespace beyond the bubble fill?
- If the bubble is cut off at an image edge, does the box extend to that edge (0 or 100)?

FONT SIZE ESTIMATION:
- "detectedFontSize" = estimate character height in the original image pixels. If the image is 800px wide and characters appear about 20px tall, report 20. Typical range: 14-40.
- "detectedFontStyle" = "bold" if strokes are thick, "condensed" if characters are narrow/tall, "normal" otherwise.

Return ONLY a valid JSON array. No markdown, no explanation.

[
  {
    "originalText": "こんにちは",
    "translatedText": "Hello",
    "bounds": {
      "x": 10.0,
      "y": 20.0,
      "width": 30.0,
      "height": 15.0
    },
    "background": {
      "type": "solid",
      "color": "#FFFFFF",
      "hasTexture": false
    },
    "detectedFontSize": 18,
    "detectedFontStyle": "bold",
    "confidence": 0.95
  }
]

If no text is found, return: []`;

      const imagePart = {
        inlineData: {
          data: imageData.split(",")[1],
          mimeType: "image/png",
        },
      };

      const result = await this.getActiveModel().generateContent([prompt, imagePart]);
      this.accumulateTokens(result);
      const response = await result.response;
      const text = response.text();

      console.log("[API] Gemini response received, parsing...");

      try {
        const cleanedText = text
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();

        const jsonMatch = cleanedText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          console.log(`[API] Parsed ${parsed.length} text regions`);

          return parsed.map((region: any) => ({
            originalText: region.originalText || "",
            translatedText: region.translatedText || region.originalText || "",
            bounds: {
              x: Math.max(0, Math.min(100, region.bounds?.x || 0)),
              y: Math.max(0, Math.min(100, region.bounds?.y || 0)),
              width: Math.max(1, Math.min(100, region.bounds?.width || 0)),
              height: Math.max(1, Math.min(100, region.bounds?.height || 0)),
            },
            background: {
              type: region.background?.type || "solid",
              color: region.background?.color || "#FFFFFF",
              hasTexture: region.background?.hasTexture || false,
            },
            detectedFontSize: region.detectedFontSize || undefined,
            detectedFontStyle: region.detectedFontStyle || undefined,
            confidence: region.confidence || 0.5,
          }));
        } else {
          console.warn("[API] No JSON array found in response");
        }
      } catch (e: any) {
        console.error("[API] Failed to parse Gemini OCR response:", e);
        console.error("[API] Response text:", text.substring(0, 500));
        throw new Error(`Invalid JSON response from Gemini OCR: ${e.message}`);
      }

      console.warn("[API] Returning empty array - no text detected");
      return [] as TextRegion[];
    });
    return { regions: value, wasRateLimited };
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
