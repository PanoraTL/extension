import React, { useEffect, useState } from "react";
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

  useEffect(() => {
    let lastW = 0;
    let lastH = 0;

    const sync = () => {
      if (!document.body.contains(imageElement)) {
        container.style.width = "0px";
        container.style.height = "0px";
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
    };

    sync();

    const ro = new ResizeObserver(sync);
    ro.observe(imageElement);

    window.addEventListener("resize", sync, { passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
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

        const fontFamily = getFontFamily(region.detectedFontStyle);
        const fontWeight = region.detectedFontStyle === "bold" ? "bold" : "600";

        const maskW = visW;
        const maskH = visH;
        const left = visX;
        const top = visY;
        const borderRadius = "4px";

        const boxWPx = (maskW / 100) * imgW;
        const boxHPx = (maskH / 100) * imgH;
        const fontSize = Math.max(10, Math.min(boxHPx * 0.28, boxWPx * 0.09, 18));

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
              backgroundColor: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
            }}
          >
            <span
              style={{
                fontFamily,
                fontSize: `${fontSize}px`,
                fontWeight,
                color: "#111111",
                textShadow: "none",
                textAlign: "center",
                wordBreak: "break-word",
                overflowWrap: "break-word",
                lineHeight: "1.25",
                maxWidth: "100%",
                display: "block",
                padding: "2px 4px",
                boxSizing: "border-box",
              }}
            >
              {region.translatedText}
            </span>
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
