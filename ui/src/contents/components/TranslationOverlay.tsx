import React, { useEffect, useState, useRef } from "react";
import type { TextRegion } from "~/types/translator.types";

interface TranslationOverlayProps {
  imageElement: HTMLImageElement;
  textRegions: TextRegion[];
  container: HTMLElement;
  onClose?: () => void;
}

function getImageContentRect(img: HTMLImageElement): { left: number; top: number; width: number; height: number } {
  const elRect = img.getBoundingClientRect();
  const elW = elRect.width;
  const elH = elRect.height;
  const natW = img.naturalWidth || elW;
  const natH = img.naturalHeight || elH;
  const objectFit = window.getComputedStyle(img).objectFit;

  if (objectFit === "contain") {
    const scale = Math.min(elW / natW, elH / natH);
    const contentW = natW * scale;
    const contentH = natH * scale;
    return {
      left: elRect.left + (elW - contentW) / 2,
      top: elRect.top + (elH - contentH) / 2,
      width: contentW,
      height: contentH,
    };
  }

  if (objectFit === "cover") {
    const scale = Math.max(elW / natW, elH / natH);
    const contentW = natW * scale;
    const contentH = natH * scale;
    return {
      left: elRect.left + (elW - contentW) / 2,
      top: elRect.top + (elH - contentH) / 2,
      width: contentW,
      height: contentH,
    };
  }

  return { left: elRect.left, top: elRect.top, width: elW, height: elH };
}

function positionContainerOverImage(container: HTMLElement, img: HTMLImageElement) {
  const content = getImageContentRect(img);
  const parentRect = (container.parentElement as HTMLElement).getBoundingClientRect();
  container.style.left = `${content.left - parentRect.left}px`;
  container.style.top = `${content.top - parentRect.top}px`;
  container.style.width = `${content.width}px`;
  container.style.height = `${content.height}px`;
}

export const TranslationOverlay: React.FC<TranslationOverlayProps> = ({
  imageElement,
  textRegions,
  container,
  onClose,
}) => {
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let lastW = 0;
    let lastH = 0;

    const sync = () => {
      if (!document.body.contains(imageElement)) {
        container.style.width = "0px";
        container.style.height = "0px";
        rafRef.current = requestAnimationFrame(sync);
        return;
      }

      positionContainerOverImage(container, imageElement);

      const content = getImageContentRect(imageElement);
      const w = Math.round(content.width);
      const h = Math.round(content.height);
      if (w !== lastW || h !== lastH) {
        lastW = w;
        lastH = h;
        setImgSize({ w, h });
      }

      rafRef.current = requestAnimationFrame(sync);
    };

    rafRef.current = requestAnimationFrame(sync);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [imageElement, container]);

const getFontFamily = (style?: string): string => {
    if (style === "condensed") return "'Anime Ace', 'Impact', 'Arial Narrow', sans-serif";
    return "'Anime Ace', 'Comic Sans MS', Arial, sans-serif";
  };

  const { w: imgW, h: imgH } = imgSize;
  if (imgW === 0 || imgH === 0) return null;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", pointerEvents: "none", overflow: "hidden" }}>
      {textRegions.map((region, index) => {
        const bx = region.bounds.x;
        const by = region.bounds.y;
        const bw = region.bounds.width;
        const bh = region.bounds.height;

        const visX = Math.max(0, bx);
        const visY = Math.max(0, by);
        const visR = Math.min(100, bx + bw);
        const visB = Math.min(100, by + bh);
        const visW = visR - visX;
        const visH = visB - visY;

        if (visW <= 0 || visH <= 0) return null;
        if ((visW * visH) / (bw * bh) < 0.5) return null;

        const clippedLeft = bx < 0;
        const clippedTop = by < 0;
        const clippedRight = bx + bw > 100;
        const clippedBottom = by + bh > 100;
        const isPartial = clippedLeft || clippedTop || clippedRight || clippedBottom;

        const fontFamily = getFontFamily(region.detectedFontStyle);
        const fontWeight = region.detectedFontStyle === "bold" ? "bold" : "700";

        const bubbleType = region.bubbleType ?? "speech";

        let maskW: number, maskH: number, left: number, top: number, borderRadius: string, padding: string, alignItems: string;

        if (!isPartial) {
          const INSET = 0.06;
          maskW = bw * (1 - INSET * 2);
          maskH = bh * (1 - INSET * 2);
          left = bx + bw / 2 - maskW / 2;
          top = by + bh / 2 - maskH / 2;

          const wPx = (maskW / 100) * imgW;
          const hPx = (maskH / 100) * imgH;
          const shortSide = Math.min(wPx, hPx);
          const r = bubbleType === "narration" ? Math.round(shortSide * 0.08) : bubbleType === "tall" ? Math.round(shortSide * 0.35) : Math.round(shortSide * 0.46);
          borderRadius = `${r}px`;
          padding = "4%";
          alignItems = "center";
        } else {
          const INSET = 0.06;
          maskW = visW * (1 - INSET * 2);
          maskH = visH * (1 - INSET * 2);
          left = visX + visW / 2 - maskW / 2;

          if (clippedTop && !clippedBottom) {
            top = 0;
          } else if (clippedBottom && !clippedTop) {
            top = 100 - maskH;
          } else {
            top = visY + visH / 2 - maskH / 2;
          }

          const wPx = (maskW / 100) * imgW;
          const hPx = (maskH / 100) * imgH;
          const shortSide = Math.min(wPx, hPx);
          const baseR = bubbleType === "narration" ? Math.round(shortSide * 0.08) : bubbleType === "tall" ? Math.round(shortSide * 0.35) : Math.round(shortSide * 0.46);
          const flat = Math.round(baseR * 0.15);
          const tl = clippedLeft || clippedTop ? flat : baseR;
          const tr = clippedRight || clippedTop ? flat : baseR;
          const br = clippedRight || clippedBottom ? flat : baseR;
          const bl = clippedLeft || clippedBottom ? flat : baseR;
          borderRadius = `${tl}px ${tr}px ${br}px ${bl}px`;
          if (clippedTop && !clippedBottom) {
            padding = "2% 2% 4% 2%";
            alignItems = "flex-start";
          } else if (clippedBottom && !clippedTop) {
            padding = "4% 2% 2% 2%";
            alignItems = "flex-end";
          } else {
            padding = "2%";
            alignItems = "center";
          }
        }

        const wPxFinal = (maskW / 100) * imgW;
        const hPxFinal = (maskH / 100) * imgH;
        const shortSideFinal = Math.min(wPxFinal, hPxFinal);

        let fontSize: number;
        const textLen = region.translatedText.length;
        const areaFactor = Math.max(1, Math.sqrt(textLen / 3));
        if (region.detectedFontSizePct && region.detectedFontSizePct > 0) {
          fontSize = Math.max(8, Math.min((region.detectedFontSizePct / 100) * imgH * 0.65, 26));
        } else {
          fontSize = Math.max(8, Math.min(shortSideFinal * 0.18 / areaFactor, 26));
        }

        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: `${top}%`,
              width: `${maskW}%`,
              height: `${maskH}%`,
              pointerEvents: "none",
              overflow: "hidden",
              borderRadius,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius,
                backgroundColor: "#FFFFFF",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems,
                justifyContent: "center",
                padding,
                boxSizing: "border-box",
              }}
            >
              <span
                style={{
                  fontFamily,
                  fontSize: `${fontSize}px`,
                  fontWeight,
                  color: "#111111",
                  textShadow: "0 0 4px rgba(255,255,255,0.8)",
                  textAlign: "center",
                  wordBreak: "break-word",
                  overflowWrap: "break-word",
                  lineHeight: "1.25",
                  maxWidth: "100%",
                  display: "block",
                }}
              >
                {region.translatedText}
              </span>
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
            width: "20px",
            height: "20px",
            background: "rgba(0,0,0,0.6)",
            color: "white",
            border: "none",
            borderRadius: "50%",
            cursor: "pointer",
            pointerEvents: "auto",
            zIndex: 1000,
            fontSize: "11px",
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
