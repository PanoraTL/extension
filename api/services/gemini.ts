import { GoogleGenerativeAI } from "@google/generative-ai"

export class GeminiService {
  private genAI: GoogleGenerativeAI | null = null
  private model: any = null

  constructor(apiKey?: string) {
    if (apiKey) {
      this.initialize(apiKey)
    }
  }

  initialize(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey)
    // Using Gemini 2.5 Flash
    this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash-latest" })
  }

  async translateText(text: string, targetLang: string = "en"): Promise<string> {
    if (!this.model) {
      throw new Error("Gemini API not initialized. Please provide an API key.")
    }

    try {
      const prompt = `Translate the following text to ${targetLang}. Only provide the translation, no explanations:\n\n${text}`

      const result = await this.model.generateContent(prompt)
      const response = await result.response
      return response.text()
    } catch (error) {
      console.error("Gemini translation error:", error)
      throw error
    }
  }

  async extractAndTranslateFromImage(
    imageData: string,
    targetLang: string = "en"
  ): Promise<{ extractedText: string; translation: string }> {
    if (!this.model) {
      throw new Error("Gemini API not initialized. Please provide an API key.")
    }

    try {
      const prompt = `Extract all text from this manga/comic image and translate it to ${targetLang}.
      Return the response in JSON format with two fields:
      - "extractedText": the original text found in the image
      - "translation": the translated text
      If no text is found, return empty strings.`

      const imagePart = {
        inlineData: {
          data: imageData.split(",")[1], // Remove data:image/xxx;base64, prefix
          mimeType: "image/png"
        }
      }

      const result = await this.model.generateContent([prompt, imagePart])
      const response = await result.response
      const text = response.text()

      // Try to parse JSON response
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0])
        }
      } catch (e) {
        console.warn("Failed to parse JSON, returning raw text")
      }

      return {
        extractedText: text,
        translation: text
      }
    } catch (error) {
      console.error("Gemini image extraction error:", error)
      throw error
    }
  }
}

export const geminiService = new GeminiService()
