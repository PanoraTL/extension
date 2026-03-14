const OTT_TTL_MS = 5 * 60 * 1000;
const processedOtts = new Map<string, number>();
export const authPopupWinIds = new Set<number>();

function evictExpiredOtts() {
  const now = Date.now();
  for (const [ott, ts] of processedOtts) {
    if (now - ts > OTT_TTL_MS) processedOtts.delete(ott);
  }
}

export function handleOttFromTab(
  tabId: number,
  tabUrl: string,
  winId: number,
): void {
  let ott: string | null = null;
  try {
    ott = new URL(tabUrl).searchParams.get("ott");
  } catch {}

  evictExpiredOtts();
  if (!ott || processedOtts.has(ott)) return;

  const authURL =
    process.env.PLASMO_PUBLIC_AUTH_SERVER_URL || "http://localhost:3000";

  fetch(`${authURL}/api/auth/cross-domain/one-time-token/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: ott }),
  })
    .then(async (res) => {
      if (!res.ok) return;
      const setCookie = res.headers.get("set-better-auth-cookie");
      if (!setCookie) return;
      authPopupWinIds.add(winId);
      await chrome.storage.local.set({ better_auth_session_cookie: setCookie });
      processedOtts.set(ott!, Date.now());
      const callbackUrl =
        chrome.runtime.getURL("tabs/auth-callback.html") + `?winId=${winId}`;
      chrome.tabs.update(tabId, { url: callbackUrl });
    })
    .catch(() => {});
}

export function handleBetterAuthFetch(
  request: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (r: any) => void,
): boolean {
  if (sender.tab) {
    sendResponse({ ok: false, status: 403, headers: {}, data: null, error: "Forbidden" });
    return false;
  }

  const authURL =
    process.env.PLASMO_PUBLIC_AUTH_SERVER_URL || "http://localhost:3000";
  const { url, method, headers: reqHeaders, body } = request;

  let parsedOrigin: string;
  try {
    parsedOrigin = new URL(url).origin;
  } catch {
    sendResponse({ ok: false, status: 400, headers: {}, data: null, error: "Invalid URL" });
    return false;
  }

  const allowedOrigin = new URL(authURL).origin;
  if (parsedOrigin !== allowedOrigin) {
    sendResponse({ ok: false, status: 403, headers: {}, data: null, error: "Origin not allowed" });
    return false;
  }

  fetch(url, {
    method: method || "GET",
    headers: reqHeaders || {},
    body: body || undefined,
  })
    .then(async (res) => {
      const resHeaders: Record<string, string> = {};
      res.headers.forEach((v: string, k: string) => { resHeaders[k] = v; });
      let data: any = null;
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : null;
      } catch {}
      sendResponse({ ok: res.ok, status: res.status, headers: resHeaders, data });
    })
    .catch((err: any) =>
      sendResponse({ ok: false, status: 500, headers: {}, data: null, error: err.message })
    );

  return true;
}

export function handleGoogleAuthSuccess(
  request: any,
  sendResponse: (r: any) => void,
): void {
  const { winId } = request;
  if (winId && authPopupWinIds.has(winId)) {
    authPopupWinIds.delete(winId);
    chrome.windows.get(winId, (win) => {
      if (!chrome.runtime.lastError && win?.type === "popup") {
        chrome.windows.remove(winId).catch(() => {});
      }
    });
  }
  chrome.action.openPopup().catch(() => {});
  chrome.runtime.sendMessage({ action: "AUTH_SESSION_UPDATED" }).catch(() => {});
  sendResponse({ success: true });
}
