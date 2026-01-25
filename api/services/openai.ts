import OpenAI from "openai"

export class OpenAIService {
  private client: OpenAI | null = null

  constructor(apiKey?: string) {
    if (apiKey) {
      this.initialize(apiKey)
    }
  }

  initialize(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true // Note: For production, use a backend proxy
    })
  }

  async translateText(text: string, targetLang: string = "en"): Promise<string> {
    if (!this.client) {
      throw new Error("OpenAI API not initialized. Please provide an API key.")
    }

    try {
      const completion = await this.client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a professional translator. Translate text to ${targetLang}. Only provide the translation, no explanations.`
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      })

      return completion.choices[0]?.message?.content || ""
    } catch (error) {
      console.error("OpenAI translation error:", error)
      throw error
    }
  }

  async extractAndTranslateFromImage(
    imageUrl: string,
    targetLang: string = "en"
  ): Promise<{ extractedText: string; translation: string }> {
    if (!this.client) {
      throw new Error("OpenAI API not initialized. Please provide an API key.")
    }

    try {
      const completion = await this.client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a professional OCR and translation assistant. Extract all text from manga/comic images and translate to ${targetLang}. Return JSON with "extractedText" and "translation" fields.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract all text from this image and translate it to ${targetLang}. Return as JSON: {"extractedText": "...", "translation": "..."}`
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })

      const responseText = completion.choices[0]?.message?.content || ""

      // Try to parse JSON response
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0])
        }
      } catch (e) {
        console.warn("Failed to parse JSON, returning raw text")
      }

      return {
        extractedText: responseText,
        translation: responseText
      }
    } catch (error) {
      console.error("OpenAI image extraction error:", error)
      throw error
    }
  }
}

export const openaiService = new OpenAIService()
