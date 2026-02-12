import { createClient } from "@convex-dev/better-auth";
import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { components } from "../_generated/api";

export const authComponent = createClient(components.betterAuth);

export const authOptions = (): BetterAuthOptions => {
  const options: BetterAuthOptions = {
    trustedOrigins: [
      "chrome-extension://*",
      "https://precise-civet-921.convex.site",
    ],
    emailAndPassword: {
      enabled: true,
    },
  };

  // Only add Google OAuth if credentials are set
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    options.socialProviders = {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        // Redirect to Convex site, not extension
        redirectURI:
          "https://precise-civet-921.convex.site/api/auth/callback/google",
      },
    };
  }

  return options;
};

export const createAuth = () => betterAuth(authOptions());
