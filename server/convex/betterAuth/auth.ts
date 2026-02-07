import { createClient } from "@convex-dev/better-auth";
import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { components } from "../_generated/api";

export const authComponent = createClient(components.betterAuth);

export const authOptions = (): BetterAuthOptions => ({
  trustedOrigins: ["chrome-extension://*", "http://localhost:3000"],
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
});

export const createAuth = () => betterAuth(authOptions());
