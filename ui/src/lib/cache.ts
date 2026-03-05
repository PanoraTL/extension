export class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private concurrent = 5;
  private active = 0;

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0 && this.active < this.concurrent) {
      const task = this.queue.shift();
      if (task) {
        this.active++;
        task().finally(() => {
          this.active--;
          this.process();
        });
      }
    }

    this.processing = false;
  }
}

export class TranslationCache {
  private readonly CACHE_KEY_PREFIX = "manga_translation_";
  private readonly TTL_MS = 60 * 60 * 1000;

  async get(imageHash: string, targetLang: string): Promise<any | null> {
    const key = `${this.CACHE_KEY_PREFIX}${imageHash}_${targetLang}`;
    const result = await chrome.storage.local.get(key);
    const entry = result[key];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.TTL_MS) {
      await chrome.storage.local.remove(key);
      return null;
    }
    return entry.data || null;
  }

  async set(imageHash: string, targetLang: string, data: any): Promise<void> {
    const key = `${this.CACHE_KEY_PREFIX}${imageHash}_${targetLang}`;
    await chrome.storage.local.set({
      [key]: { data, timestamp: Date.now() },
    });
  }

  async clearAll(): Promise<number> {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (items) => {
        const keys = Object.keys(items).filter((k) =>
          k.startsWith(this.CACHE_KEY_PREFIX)
        );
        if (keys.length === 0) {
          resolve(0);
          return;
        }
        chrome.storage.local.remove(keys, () => resolve(keys.length));
      });
    });
  }

  static async hashImage(dataUrl: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(dataUrl);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}

export const cache = new TranslationCache();
export const requestQueue = new RequestQueue();
