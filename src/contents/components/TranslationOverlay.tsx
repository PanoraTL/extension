import React, { useEffect, useState, useRef } from "react";
import type { TextRegion } from "~/types/translator.types";

interface TranslationOverlayProps {
  imageElement: HTMLImageElement;
  textRegions: TextRegion[];
  container: HTMLElement;
  onClose?: () => void;
}

export const TranslationOverlay: React.FC<TranslationOverlayProps> = ({
  imageElement,
  textRegions,
  container,
  onClose,
}) => {
  const [fontLoaded, setFontLoaded] = useState(false);
  const [imgDims, setImgDims] = useState({ width: 0, height: 0 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => setFontLoaded(true));
    } else {
      setFontLoaded(true);
    }

    const syncContainer = () => {
      const imgRect = imageElement.getBoundingClientRect();

      const anchor = container.offsetParent as HTMLElement | null;
      const anchorRect = anchor
        ? anchor.getBoundingClientRect()
        : { left: 0, top: 0 };

      container.style.left = `${imgRect.left - anchorRect.left}px`;
      container.style.top = `${imgRect.top - anchorRect.top}px`;
      container.style.width = `${imgRect.width}px`;
      container.style.height = `${imgRect.height}px`;

      setImgDims((prev) => {
        if (
          Math.abs(prev.width - imgRect.width) > 2 ||
          Math.abs(prev.height - imgRect.height) > 2
        ) {
          return { width: imgRect.width, height: imgRect.height };
        }
        return prev;
      });

      rafRef.current = requestAnimationFrame(syncContainer);
    };

    syncContainer();

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [imageElement, container]);

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
      const naturalW = imageElement.naturalWidth || imgDims.width;
      const scale = imgDims.width / naturalW;
      const scaled = region.detectedFontSize * scale;
      return Math.max(10, Math.min(scaled, 44));
    }

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

  if (imgDims.width === 0 || imgDims.height === 0) return null;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      {fontLoaded &&
        textRegions.map((region, index) => {
          const bgColor = region.background?.color || "#FFFFFF";
          const textColor = getContrastColor(bgColor);

          const x = region.bounds.x;
          const y = region.bounds.y;
          const w = region.bounds.width;
          const h = region.bounds.height;

          const clampedX = Math.max(0, x);
          const clampedY = Math.max(0, y);
          const clampedRight = Math.min(100, x + w);
          const clampedBottom = Math.min(100, y + h);
          const clampedW = clampedRight - clampedX;
          const clampedH = clampedBottom - clampedY;

          const clippedTop = y <= 1;
          const clippedBottom = y + h >= 99;
          const clippedLeft = x <= 1;
          const clippedRight = x + w >= 99;

          let borderRadius: string;
          if (clippedTop && !clippedBottom) {
            borderRadius = "0 0 50% 50% / 0 0 100% 100%";
          } else if (clippedBottom && !clippedTop) {
            borderRadius = "50% 50% 0 0 / 100% 100% 0 0";
          } else if (clippedLeft && !clippedRight) {
            borderRadius = "0 50% 50% 0 / 0 100% 100% 0";
          } else if (clippedRight && !clippedLeft) {
            borderRadius = "50% 0 0 50% / 100% 0 0 100%";
          } else {
            borderRadius = "50%";
          }

          const padTop = clippedTop ? "0" : "7%";
          const padBottom = clippedBottom ? "0" : "7%";
          const padLeft = clippedLeft ? "0" : "7%";
          const padRight = clippedRight ? "0" : "7%";

          const widthPx = (clampedW / 100) * imgDims.width;
          const heightPx = (clampedH / 100) * imgDims.height;
          const fontSize = calculateFontSize(region, widthPx, heightPx);
          const fontFamily = getFontFamily(region.detectedFontStyle);
          const fontWeight =
            region.detectedFontStyle === "bold" ? "bold" : "700";

          return (
            <div
              key={index}
              style={{
                position: "absolute",
                left: `${clampedX}%`,
                top: `${clampedY}%`,
                width: `${clampedW}%`,
                height: `${clampedH}%`,
                backgroundColor: bgColor,
                borderRadius,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: `${padTop} ${padRight} ${padBottom} ${padLeft}`,
                boxSizing: "border-box",
                pointerEvents: "none",
                boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
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
