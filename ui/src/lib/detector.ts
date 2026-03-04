/**
 * detector.ts — Local detection server client and text-region builder.
 */

import type { DetectedBubble, TextRegion } from "~/types/translator.types";

const MODEL_SERVER_URL = "http://localhost:5001";

export async function detectBubbles(imageDataUrl: string): Promise<DetectedBubble[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`${MODEL_SERVER_URL}/detect-bubbles`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_data: imageDataUrl }),
    });
    if (!response.ok) throw new Error(`Detection server returned ${response.status}`);
    const data = await response.json();
    return (Array.isArray(data) ? data : []).filter(
      (b: DetectedBubble) => !!b.cropDataUrl
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function buildTextRegions(
  bubbles: DetectedBubble[],
  translations: string[],
): TextRegion[] {
  const regions: TextRegion[] = [];
  for (let i = 0; i < bubbles.length; i++) {
    const translatedText = translations[i] ?? "";
    if (!translatedText.trim()) continue;
    regions.push({
      translatedText,
      bounds: bubbles[i].bounds,
      background: bubbles[i].background,
      detectedFontSizePct: bubbles[i].detectedFontSizePct,
      detectedFontStyle: "normal",
      confidence: bubbles[i].confidence,
      bubbleType: bubbles[i].bubbleType,
    });
  }
  return regions;
}
