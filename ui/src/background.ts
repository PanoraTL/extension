import { geminiService } from "~/api/services";
import { cache } from "~/lib/cache";
import {
  handleOttFromTab,
  handleBetterAuthFetch,
  handleGoogleAuthSuccess,
} from "~/lib/auth-handler";
import {
  batchAbortedByTab,
  sessionStatsByTab,
  handleFetchImage,
  handleProcessImages,
  handleProcessImagesBatch,
} from "~/lib/processor";

chrome.runtime.onInstalled.addListener(() => {});

async function initializeServices() {
  const result = await chrome.storage.local.get("gemini_api_key");
  const apiKey = result.gemini_api_key;
  if (!apiKey) return;
  geminiService.initialize(apiKey);
}

const initPromise = initializeServices();

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    batchAbortedByTab.set(tabId, true);
    sessionStatsByTab.delete(tabId);
  }

  if (tab.url) {
    handleOttFromTab(tabId, tab.url, tab.windowId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  batchAbortedByTab.set(tabId, true);
  sessionStatsByTab.delete(tabId);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "FETCH_IMAGE") {
    initPromise.then(() =>
      handleFetchImage(request.url)
        .then((dataUrl) => sendResponse({ dataUrl }))
        .catch((error) => sendResponse({ error: error.message }))
    );
    return true;
  }

  if (request.action === "PROCESS_IMAGES") {
    initPromise.then(() =>
      handleProcessImages(request, sender.tab?.id)
        .then(sendResponse)
        .catch((error) => {
          console.error("[BACKGROUND] Process images error:", error);
          sendResponse({ success: false, error: error.message });
        })
    );
    return true;
  }

  if (request.action === "PROCESS_IMAGES_BATCH") {
    const tabId = sender.tab?.id;
    if (tabId !== undefined) {
      batchAbortedByTab.set(tabId, false);
      if (!sessionStatsByTab.has(tabId)) {
        geminiService.resetTokenCount();
        console.log(`[BACKGROUND] Starting translation: ${request.total} panel(s)`);
        sessionStatsByTab.set(tabId, {
          startTime: Date.now(),
          inputTokens: 0,
          outputTokens: 0,
          totalPanels: request.total,
          completedPanels: 0,
          cachedPanels: 0,
          chunksDone: 0,
          totalChunks: Math.ceil(request.total / 10),
        });
      }
    }
    sendResponse({ success: true });
    const keepaliveInterval = setInterval(() => {
      chrome.storage.local.get(null, () => {});
    }, 20000);
    initPromise.then(() => handleProcessImagesBatch(request, tabId)).finally(() => {
      clearInterval(keepaliveInterval);
    });
    return false;
  }

  if (request.action === "STOP_TRANSLATION") {
    const tabId = sender.tab?.id ?? request.tabId;
    if (tabId !== undefined) batchAbortedByTab.set(tabId, true);
    sendResponse({ success: true });
    return false;
  }

  if (request.action === "GET_TRANSLATION_STATUS") {
    const tabId = request.tabId;
    const session = tabId !== undefined ? sessionStatsByTab.get(tabId) : undefined;
    sendResponse({
      isProcessing: session !== undefined,
      completedPanels: session?.completedPanels ?? 0,
      totalPanels: session?.totalPanels ?? 0,
    });
    return false;
  }

  if (request.action === "BETTER_AUTH_FETCH") {
    return handleBetterAuthFetch(request, sender, sendResponse);
  }

  if (request.action === "GOOGLE_AUTH_SUCCESS") {
    handleGoogleAuthSuccess(request, sendResponse);
    return false;
  }

  if (request.action === "UPDATE_API_KEY") {
    const newKey = request.apiKey?.trim();
    if (newKey) {
      geminiService.initialize(newKey);
    } else {
      geminiService.clear();
    }
    sendResponse({ success: true });
    return false;
  }

  if (request.action === "CLEAR_CACHE") {
    cache.clearAll().then((cleared) => sendResponse({ success: true, cleared }));
    return true;
  }

  if (request.action === "PROGRESS_UPDATE" || request.action === "ERROR") {
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, request).catch(() => {});
    }
    sendResponse({ forwarded: true });
    return false;
  }

  return false;
});
