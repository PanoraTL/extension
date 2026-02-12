import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./betterAuth/auth";

const http = httpRouter();
authComponent.registerRoutes(http, createAuth, {
  cors: {
    allowedOrigins: [
      "chrome-extension://*",
      "https://precise-civet-921.convex.site",
    ],
  },
});

export default http;
