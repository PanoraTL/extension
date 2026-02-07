import { createApi } from "@convex-dev/better-auth";
import schema from "../schema";
import { authOptions } from "./auth";

export const api = createApi(schema, authOptions);
