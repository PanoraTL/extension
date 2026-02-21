import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./betterAuth/auth";

const http = httpRouter();
authComponent.registerRoutes(http, createAuth, {
  cors: {
    allowedOrigins: [
      "chrome-extension://*",
      ...(process.env.CONVEX_SITE_URL ? [process.env.CONVEX_SITE_URL] : []),
    ],
  },
});

export default http;
