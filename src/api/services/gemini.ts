import { GoogleGenerativeAI } from "@google/generative-ai";
import type { TextRegion } from "~/types/translator.types";

export class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;

  constructor(apiKey?: string) {
    if (apiKey) {
      this.initialize(apiKey);
    }
  }

  initialize(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-2.5-flash-latest",
    });
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

      const result = await this.model.generateContent(prompt);
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

      const result = await this.model.generateContent([prompt, imagePart]);
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

  
  async detectTextRegionsWithOCR(
    imageData: string,
    targetLang: string = "en",
  ): Promise<TextRegion[]> {
    if (!this.model) {
      throw new Error("Gemini API not initialized. Please provide an API key.");
    }

    try {
      const prompt = `You are analyzing a manga/comic image. Extract ALL text regions with their exact positions and background information.

For EACH text region found, provide:
1. The original text (exact transcription, preserve line breaks)
2. Bounding box coordinates as percentages of image dimensions (0-100):
   - x: horizontal position from left edge (%)
   - y: vertical position from top edge (%)
   - width: width of text region (%)
   - height: height of text region (%)
3. Background color (hex code, e.g., #FFFFFF) - sample the dominant color behind the text
4. Background type: "solid" or "pattern"
5. Confidence score (0.0 to 1.0)

Return ONLY a valid JSON array with this exact structure:
[
  {
    "originalText": "こんにちは",
    "bounds": { "x": 10.5, "y": 20.3, "width": 30.2, "height": 10.5 },
    "background": {
      "type": "solid",
      "color": "#FFFFFF",
      "hasTexture": false
    },
    "confidence": 0.95
  }
]

IMPORTANT RULES:
- Coordinates MUST be percentages (0-100) of image width/height, NOT pixels
- Include ALL text, even small text, sound effects, or text outside speech bubbles
- Bounding boxes should tightly fit the text region
- If no text found, return empty array: []
- Return ONLY valid JSON, no markdown formatting, no explanations
- For vertical text (common in Japanese manga), still provide left-to-right bounding box`;

      const imagePart = {
        inlineData: {
          data: imageData.split(",")[1],
          mimeType: "image/png",
        },
      };

      const result = await this.model.generateContent([prompt, imagePart]);
      const response = await result.response;
      const text = response.text();

      try {
        const cleanedText = text
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "");

        const jsonMatch = cleanedText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);

          return parsed.map((region: any) => ({
            originalText: region.originalText || "",
            translatedText: region.originalText || "",
            bounds: {
              x: region.bounds?.x || 0,
              y: region.bounds?.y || 0,
              width: region.bounds?.width || 0,
              height: region.bounds?.height || 0,
            },
            background: {
              type: region.background?.type || "solid",
              color: region.background?.color || "#FFFFFF",
              hasTexture: region.background?.hasTexture || false,
            },
            confidence: region.confidence || 0.5,
          }));
        }
      } catch (e) {
        console.error("Failed to parse Gemini OCR response:", e);
        console.error("Response text:", text);
        throw new Error("Invalid JSON response from Gemini OCR");
      }

      return [];
    } catch (error) {
      console.error("Gemini OCR detection error:", error);
      throw error;
    }
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

      const result = await this.model.generateContent(prompt);
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
