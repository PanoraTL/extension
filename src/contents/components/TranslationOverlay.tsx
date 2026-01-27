import React, { useEffect, useRef } from "react";
import type { TextRegion } from "~/types/translator.types";

interface TranslationOverlayProps {
  imageElement: HTMLImageElement;
  textRegions: TextRegion[];
  showOriginal: boolean;
  onClose?: () => void;
}

export const TranslationOverlay: React.FC<TranslationOverlayProps> = ({
  imageElement,
  textRegions,
  showOriginal: _showOriginal,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log(
      "[OVERLAY] Rendering overlay with",
      textRegions.length,
      "regions",
    );
    renderOverlay();
  }, [textRegions, imageElement]);

  const renderOverlay = () => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const rect = imageElement.getBoundingClientRect();

    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    textRegions.forEach((region) => {
      const x = (region.bounds.x / 100) * rect.width;
      const y = (region.bounds.y / 100) * rect.height;
      const width = (region.bounds.width / 100) * rect.width;
      const height = (region.bounds.height / 100) * rect.height;

      ctx.fillStyle = region.background?.color || "#FFFFFF";
      ctx.fillRect(x, y, width, height);

      ctx.strokeStyle = "#00000033";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, width, height);
    });
  };

  const convertPercentToPixel = (region: TextRegion) => {
    const rect = imageElement.getBoundingClientRect();
    return {
      x: (region.bounds.x / 100) * rect.width,
      y: (region.bounds.y / 100) * rect.height,
      width: (region.bounds.width / 100) * rect.width,
      height: (region.bounds.height / 100) * rect.height,
    };
  };

  const calculateFontSize = (text: string, width: number, height: number) => {
    const baseSize = Math.min(width, height) * 0.3;
    const lengthFactor = Math.sqrt(text.length);
    return Math.max(10, Math.min(baseSize / lengthFactor, 24));
  };

  const getContrastColor = (hexColor: string) => {
    try {
      const r = parseInt(hexColor.slice(1, 3), 16);
      const g = parseInt(hexColor.slice(3, 5), 16);
      const b = parseInt(hexColor.slice(5, 7), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.5 ? "#000000" : "#FFFFFF";
    } catch (e) {
      return "#000000";
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 999,
      }}
    >
      {/* Canvas for backgrounds */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />

      {/* Text elements */}
      {textRegions.map((region, index) => {
        const pixels = convertPercentToPixel(region);
        const fontSize = calculateFontSize(
          region.translatedText,
          pixels.width,
          pixels.height,
        );
        const textColor = getContrastColor(
          region.background?.color || "#FFFFFF",
        );

        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: `${pixels.x}px`,
              top: `${pixels.y}px`,
              width: `${pixels.width}px`,
              height: `${pixels.height}px`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              fontFamily: "'Comic Sans MS', Arial, sans-serif",
              fontSize: `${fontSize}px`,
              fontWeight: "bold",
              color: textColor,
              lineHeight: 1.2,
              padding: "4px",
              boxSizing: "border-box",
              overflow: "hidden",
              wordWrap: "break-word",
              textShadow: `0 0 2px ${region.background?.color || "#FFFFFF"}`,
              pointerEvents: "none",
            }}
          >
            {region.translatedText}
          </div>
        );
      })}

      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "5px",
            right: "5px",
            padding: "4px 8px",
            background: "rgba(0,0,0,0.7)",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            pointerEvents: "auto",
            zIndex: 1000,
            fontSize: "14px",
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
};
