import type { DetectedImage } from "~/types/translator.types";

export class ImageDetector {
  private static readonly MIN_IMAGE_SIZE = 50;
  private static imageCounter = 0;

  static findImages(bounds?: DOMRect): HTMLImageElement[] {
    const images = Array.from(document.querySelectorAll("img"));

    return images.filter((img) => {
      if (!bounds) {
        return this.isInDocument(img);
      }

      const rect = img.getBoundingClientRect();
      return this.isVisible(img) && this.intersects(rect, bounds);
    });
  }

  static async detectImages(bounds?: DOMRect): Promise<DetectedImage[]> {
    const imageElements = this.findImages(bounds);
    const detectedImages: DetectedImage[] = [];

    console.log(
      `[IMAGE_DETECTOR] Found ${imageElements.length} visible images`,
    );

    for (const img of imageElements) {
      try {
        if (!this.isMangaPanel(img)) {
          continue;
        }

        const dataUrl = await this.toDataUrl(img);
        const detected: DetectedImage = {
          id: this.generateImageId(img),
          element: img,
          src: img.src,
          dataUrl,
          bounds: img.getBoundingClientRect(),
          visible: this.isVisible(img),
        };
        detectedImages.push(detected);
      } catch (error) {
        console.warn(
          "[IMAGE_DETECTOR] Failed to convert image:",
          img.src.substring(0, 80),
          error,
        );
      }
    }

    console.log(
      `[IMAGE_DETECTOR] Successfully converted ${detectedImages.length} manga panel images`,
    );
    return detectedImages;
  }

  static async toDataUrl(img: HTMLImageElement): Promise<string> {
    const isCrossOrigin = this.isCrossOrigin(img.src);

    if (!isCrossOrigin) {
      try {
        const dataUrl = await this.convertWithCanvas(img, false);
        console.log(
          "[IMAGE_DETECTOR] Same-origin canvas conversion successful",
        );
        return dataUrl;
      } catch (error) {
        console.warn("[IMAGE_DETECTOR] Same-origin canvas failed:", error);
      }
    }

    console.log(
      "[IMAGE_DETECTOR] Cross-origin image, using background fetch:",
      img.src.substring(0, 80),
    );
    return await this.fetchThroughBackground(img.src);
  }

  private static isCrossOrigin(url: string): boolean {
    try {
      const imageUrl = new URL(url, window.location.href);
      return imageUrl.origin !== window.location.origin;
    } catch {
      return true;
    }
  }

  private static async convertWithCanvas(
    img: HTMLImageElement,
    forceCors: boolean,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!forceCors && img.complete && img.naturalWidth > 0) {
        try {
          const dataUrl = this.drawImageToCanvas(img);
          resolve(dataUrl);
        } catch (error) {
          reject(error);
        }
        return;
      }

      const newImg = new Image();
      if (forceCors) {
        newImg.crossOrigin = "anonymous";
      }

      const timeout = setTimeout(() => {
        reject(new Error("Image load timeout"));
      }, 8000);

      newImg.onload = () => {
        clearTimeout(timeout);
        try {
          const dataUrl = this.drawImageToCanvas(newImg);
          resolve(dataUrl);
        } catch (error) {
          reject(error);
        }
      };

      newImg.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Image load failed"));
      };

      newImg.src = img.src;
    });
  }

  private static drawImageToCanvas(img: HTMLImageElement): string {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;

    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error("Image has zero dimensions");
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get canvas context");
    }

    ctx.drawImage(img, 0, 0);

    const maxSize = 2048;
    if (canvas.width > maxSize || canvas.height > maxSize) {
      const scale = maxSize / Math.max(canvas.width, canvas.height);
      const resizedCanvas = document.createElement("canvas");
      resizedCanvas.width = Math.round(canvas.width * scale);
      resizedCanvas.height = Math.round(canvas.height * scale);

      const resizedCtx = resizedCanvas.getContext("2d");
      if (!resizedCtx) {
        throw new Error("Failed to get resized canvas context");
      }

      resizedCtx.drawImage(
        canvas,
        0,
        0,
        resizedCanvas.width,
        resizedCanvas.height,
      );
      return resizedCanvas.toDataURL("image/png");
    }

    return canvas.toDataURL("image/png");
  }

  private static async fetchThroughBackground(url: string): Promise<string> {
    if (!chrome.runtime?.id) {
      throw new Error(
        "Extension context invalidated - please refresh the page",
      );
    }

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Background image fetch timeout (15s)"));
      }, 15000);

      try {
        chrome.runtime.sendMessage(
          { action: "FETCH_IMAGE", url },
          (response) => {
            clearTimeout(timeout);

            if (chrome.runtime.lastError) {
              reject(
                new Error(
                  chrome.runtime.lastError.message || "Background fetch failed",
                ),
              );
              return;
            }

            if (response?.dataUrl) {
              console.log("[IMAGE_DETECTOR] Background fetch successful");
              resolve(response.dataUrl);
            } else {
              reject(
                new Error(
                  response?.error || "No data URL returned from background",
                ),
              );
            }
          },
        );
      } catch (error) {
        clearTimeout(timeout);
        reject(
          new Error(
            error instanceof Error ? error.message : "Failed to send message",
          ),
        );
      }
    });
  }

  static isInDocument(img: HTMLImageElement): boolean {
    const rect = img.getBoundingClientRect();
    const style = window.getComputedStyle(img);

    return (
      rect.width >= this.MIN_IMAGE_SIZE &&
      rect.height >= this.MIN_IMAGE_SIZE &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      img.complete &&
      img.naturalWidth > 0
    );
  }

  static isVisible(img: HTMLImageElement): boolean {
    const rect = img.getBoundingClientRect();
    const style = window.getComputedStyle(img);

    if (rect.width < this.MIN_IMAGE_SIZE || rect.height < this.MIN_IMAGE_SIZE) {
      return false;
    }

    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }

    const buffer = 200;
    return (
      rect.top < window.innerHeight + buffer &&
      rect.bottom > -buffer &&
      rect.left < window.innerWidth + buffer &&
      rect.right > -buffer
    );
  }

  static intersects(rect1: DOMRect, rect2: DOMRect): boolean {
    return !(
      rect1.right < rect2.left ||
      rect1.left > rect2.right ||
      rect1.bottom < rect2.top ||
      rect1.top > rect2.bottom
    );
  }

  static generateImageId(img: HTMLImageElement): string {
    const src = img.src.substring(img.src.lastIndexOf("/") + 1);
    const id = `img_${this.imageCounter++}_${src}_${img.offsetTop}_${img.offsetLeft}`;
    return id.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 64);
  }

  static isMangaPanel(img: HTMLImageElement): boolean {
    const rect = img.getBoundingClientRect();
    const aspectRatio = rect.width / rect.height;

    return (
      aspectRatio >= 0.1 &&
      aspectRatio <= 5.0 &&
      rect.width >= 100 &&
      rect.height >= 100 &&
      (rect.width > 200 || rect.height > 200)
    );
  }

}
