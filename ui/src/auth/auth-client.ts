import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.PLASMO_PUBLIC_AUTH_SERVER_URL || "http://localhost:3000",
});
