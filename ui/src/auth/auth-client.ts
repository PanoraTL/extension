import { crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const backgroundFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const headers: Record<string, string> = {};
  if (init?.headers) {
    const h = new Headers(init.headers as HeadersInit);
    h.forEach((v, k) => { headers[k] = v; });
  }
  return new Promise<Response>((resolve) => {
    chrome.runtime.sendMessage(
      {
        action: "BETTER_AUTH_FETCH",
        url,
        method: init?.method || "GET",
        headers,
        body: init?.body ? String(init.body) : undefined,
      },
      (result) => {
        const responseHeaders = new Headers(result.headers || {});
        resolve(
          new Response(result.data !== null ? JSON.stringify(result.data) : null, {
            status: result.status,
            headers: responseHeaders,
          })
        );
      }
    );
  });
};

export const authClient = createAuthClient({
  baseURL: process.env.PLASMO_PUBLIC_AUTH_SERVER_URL || "http://localhost:3000",
  plugins: [crossDomainClient()],
  fetchOptions: { customFetchImpl: backgroundFetch },
  disableDefaultFetchPlugins: true,
});
