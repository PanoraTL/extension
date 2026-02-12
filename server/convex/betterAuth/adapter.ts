import { createApi } from "@convex-dev/better-auth";
import type { SchemaDefinition } from "convex/server";
import type { BetterAuthOptions } from "better-auth";
import schema from "../schema";
import { authOptions } from "./auth";

export const api: ReturnType<typeof createApi<SchemaDefinition<any, any>>> =
  createApi(schema, authOptions);
