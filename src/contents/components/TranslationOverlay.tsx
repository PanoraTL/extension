import React, { useEffect, useState, useRef } from "react";
import type { TextRegion } from "~/types/translator.types";

interface TranslationOverlayProps {
  imageElement: HTMLImageElement;
  textRegions: TextRegion[];
  onClose?: () => void;
}

export const TranslationOverlay: React.FC<TranslationOverlayProps> = ({
  imageElement,
  textRegions,
  onClose,
}) => {
  const [fontLoaded, setFontLoaded] = useState(false);
  // We store the live image dimensions so masks stay locked to the image
  const [imgDims, setImgDims] = useState({ width: 0, height: 0 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => setFontLoaded(true));
    } else {
      setFontLoaded(true);
    }

    // Poll the image's rendered size so masks track it through any CSS reflows
    const measureImage = () => {
      const rect = imageElement.getBoundingClientRect();
      setImgDims((prev) => {
        if (
          Math.abs(prev.width - rect.width) > 0.5 ||
          Math.abs(prev.height - rect.height) > 0.5
        ) {
          return { width: rect.width, height: rect.height };
        }
        return prev;
      });
      rafRef.current = requestAnimationFrame(measureImage);
    };

    measureImage();

    const handleResize = () => {
      const rect = imageElement.getBoundingClientRect();
      setImgDims({ width: rect.width, height: rect.height });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [imageElement]);

  const getFontFamily = (style?: string): string => {
    if (style === "condensed") {
      return "'Anime Ace', 'Impact', 'Arial Narrow', sans-serif";
    }
    return "'Anime Ace', 'Comic Sans MS', Arial, sans-serif";
  };

  const calculateFontSize = (
    region: TextRegion,
    maskWidthPx: number,
    maskHeightPx: number,
  ): number => {
    if (region.detectedFontSize && region.detectedFontSize > 0) {
      // detectedFontSize is in the original (natural) image pixel space.
      // Scale to the displayed image pixel space.
      const naturalW = imageElement.naturalWidth || imgDims.width;
      const scale = imgDims.width / naturalW;
      const scaled = region.detectedFontSize * scale;
      return Math.max(10, Math.min(scaled, 44));
    }

    // Fallback: size text to fit inside the mask
    const text = region.translatedText;
    const smaller = Math.min(maskWidthPx, maskHeightPx);
    const baseSize = smaller * 0.3;
    const lengthFactor = Math.max(1, Math.sqrt(text.length / 5));
    return Math.max(10, Math.min(baseSize / lengthFactor, 38));
  };

  const getContrastColor = (hexColor: string): string => {
    try {
      const hex = hexColor.replace("#", "");
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.5 ? "#000000" : "#FFFFFF";
    } catch {
      return "#000000";
    }
  };

  // If we haven't measured the image yet, render nothing
  if (imgDims.width === 0 || imgDims.height === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        // Lock the overlay to the exact current image dimensions
        width: `${imgDims.width}px`,
        height: `${imgDims.height}px`,
        pointerEvents: "none",
        zIndex: 999,
      }}
    >
      {fontLoaded &&
        textRegions.map((region, index) => {
          const bgColor = region.background?.color || "#FFFFFF";
          const textColor = getContrastColor(bgColor);

          // Convert percentage bounds to pixel positions within imgDims
          const leftPx = (region.bounds.x / 100) * imgDims.width;
          const topPx = (region.bounds.y / 100) * imgDims.height;
          const widthPx = (region.bounds.width / 100) * imgDims.width;
          const heightPx = (region.bounds.height / 100) * imgDims.height;

          const fontSize = calculateFontSize(region, widthPx, heightPx);
          const fontFamily = getFontFamily(region.detectedFontStyle);
          const fontWeight =
            region.detectedFontStyle === "bold" ? "bold" : "700";

          // Padding: inset the text away from the ellipse edge
          const padX = Math.max(widthPx * 0.12, 4);
          const padY = Math.max(heightPx * 0.12, 4);

          return (
            <div
              key={index}
              style={{
                position: "absolute",
                left: `${leftPx}px`,
                top: `${topPx}px`,
                width: `${widthPx}px`,
                height: `${heightPx}px`,
                backgroundColor: bgColor,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: `${padY}px ${padX}px`,
                boxSizing: "border-box",
                pointerEvents: "none",
                boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
              }}
            >
              <div
                style={{
                  fontFamily,
                  fontSize: `${fontSize}px`,
                  fontWeight,
                  color: textColor,
                  textAlign: "center",
                  wordWrap: "break-word",
                  overflowWrap: "break-word",
                  overflow: "hidden",
                  lineHeight: "1.2",
                  width: "100%",
                  maxHeight: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  WebkitFontSmoothing: "antialiased",
                  textRendering: "optimizeLegibility",
                  textShadow: `
                    -1px -1px 0 ${bgColor},
                     1px -1px 0 ${bgColor},
                    -1px  1px 0 ${bgColor},
                     1px  1px 0 ${bgColor}
                  `,
                }}
              >
                {region.translatedText}
              </div>
            </div>
          );
        })}

      {onClose && (
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "4px",
            right: "4px",
            width: "22px",
            height: "22px",
            background: "rgba(0,0,0,0.7)",
            color: "white",
            border: "none",
            borderRadius: "50%",
            cursor: "pointer",
            pointerEvents: "auto",
            zIndex: 1000,
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: "1",
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
};
