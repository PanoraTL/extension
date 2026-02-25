import { createClient } from "@convex-dev/better-auth";
import { crossDomain } from "@convex-dev/better-auth/plugins";
import type { GenericCtx } from "@convex-dev/better-auth";
import { betterAuth } from "better-auth";
import { components } from "../_generated/api";

export const authComponent = createClient(components.betterAuth, {
  verbose: true,
});

export const createAuth = (ctx: GenericCtx) =>
  betterAuth({
    baseURL: process.env.CONVEX_SITE_URL,
    basePath: "/api/auth",
    trustedOrigins: [
      "chrome-extension://*",
      ...(process.env.CONVEX_SITE_URL ? [process.env.CONVEX_SITE_URL] : []),
    ],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    },
    plugins: [
      crossDomain({ siteUrl: process.env.CONVEX_SITE_URL! }),
    ],
  });
