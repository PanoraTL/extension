import type { DetectedImage } from "~/types/translator.types";

export class ImageDetector {
  private static readonly MIN_IMAGE_SIZE = 50;
  private static imageCounter = 0;

  static findImages(bounds?: DOMRect): HTMLImageElement[] {
    const images = Array.from(document.querySelectorAll("img"));

    return images.filter((img) => {
      if (!bounds) {
        return this.isVisible(img);
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
          "[IMAGE_DETECTOR] Failed to convert image to data URL:",
          img.src,
          error,
        );
      }
    }

    console.log(
      `[IMAGE_DETECTOR] Successfully converted ${detectedImages.length} images`,
    );
    return detectedImages;
  }

  static async toDataUrl(img: HTMLImageElement): Promise<string> {
    console.log(
      "[IMAGE_DETECTOR] Converting image:",
      img.src.substring(0, 100),
    );
    try {
      const dataUrl = await this.convertWithCanvas(img);
      console.log("[IMAGE_DETECTOR] Canvas conversion successful");
      return dataUrl;
    } catch (error) {
      console.warn(
        "[IMAGE_DETECTOR] Canvas conversion failed, trying background fetch:",
        error,
      );
      return await this.fetchThroughBackground(img.src);
    }
  }

  private static async convertWithCanvas(
    img: HTMLImageElement,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0);

        const maxSize = 2048;
        if (canvas.width > maxSize || canvas.height > maxSize) {
          const scale = maxSize / Math.max(canvas.width, canvas.height);
          const resizedCanvas = document.createElement("canvas");
          resizedCanvas.width = canvas.width * scale;
          resizedCanvas.height = canvas.height * scale;

          const resizedCtx = resizedCanvas.getContext("2d");
          if (!resizedCtx) {
            reject(new Error("Failed to get resized canvas context"));
            return;
          }

          resizedCtx.drawImage(
            canvas,
            0,
            0,
            resizedCanvas.width,
            resizedCanvas.height,
          );
          resolve(resizedCanvas.toDataURL("image/png"));
        } else {
          resolve(canvas.toDataURL("image/png"));
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  private static async fetchThroughBackground(url: string): Promise<string> {
    console.log("[IMAGE_DETECTOR] Fetching through background:", url);

    if (!chrome.runtime?.id) {
      const error = new Error(
        "Extension context invalidated - please refresh the page",
      );
      console.error("[IMAGE_DETECTOR]", error.message);
      throw error;
    }

    const timeout = 10000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Image fetch timeout after 10s")),
        timeout,
      ),
    );

    const fetchPromise = new Promise<string>((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(
          { action: "FETCH_IMAGE", url },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error(
                "[IMAGE_DETECTOR] Background fetch error:",
                chrome.runtime.lastError,
              );
              reject(chrome.runtime.lastError);
            } else if (response?.dataUrl) {
              console.log("[IMAGE_DETECTOR] Background fetch successful");
              resolve(response.dataUrl);
            } else {
              console.error(
                "[IMAGE_DETECTOR] No dataUrl in response:",
                response,
              );
              reject(
                new Error(
                  response?.error || "Failed to fetch image from background",
                ),
              );
            }
          },
        );
      } catch (error) {
        console.error("[IMAGE_DETECTOR] Send message exception:", error);
        reject(error);
      }
    });

    return Promise.race([fetchPromise, timeoutPromise]);
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

    const buffer = 100;
    const inViewport =
      rect.top < window.innerHeight + buffer &&
      rect.bottom > -buffer &&
      rect.left < window.innerWidth + buffer &&
      rect.right > -buffer;

    return inViewport;
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
    const pos = img.getBoundingClientRect();
    const id = `img_${this.imageCounter++}_${src}_${Math.floor(pos.x)}_${Math.floor(pos.y)}`;
    return id.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 64);
  }

  static getVisibleImages(): HTMLImageElement[] {
    return this.findImages();
  }

  static batchImages<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  static isMangaPanel(img: HTMLImageElement): boolean {
    const rect = img.getBoundingClientRect();
    const aspectRatio = rect.width / rect.height;

    return (
      aspectRatio >= 0.5 &&
      aspectRatio <= 2.0 &&
      (rect.width > 200 || rect.height > 200)
    );
  }

  static resetCounter(): void {
    this.imageCounter = 0;
  }
}
