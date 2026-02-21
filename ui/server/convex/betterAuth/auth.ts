import { createClient } from "@convex-dev/better-auth";
import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { components } from "../_generated/api";

export const authComponent = createClient(components.betterAuth, {
  verbose: true,
});

export const authOptions = (): BetterAuthOptions => {
  const options: BetterAuthOptions = {
    baseURL:
      process.env.CONVEX_SITE_URL || "https://precise-civet-921.convex.site",
    basePath: "/api/auth",
    trustedOrigins: [
      "chrome-extension://*",
      "https://precise-civet-921.convex.site",
    ],
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    },
  };

  return options;
};

export const createAuth = () => betterAuth(authOptions());
