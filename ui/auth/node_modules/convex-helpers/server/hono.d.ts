/**
 * This file contains a helper class for integrating Convex with Hono.
 *
 * See the [guide on Stack](https://stack.convex.dev/hono-with-convex)
 * for tips on using Hono for HTTP endpoints.
 *
 * To use this helper, create a new Hono app in convex/http.ts like so:
 * ```ts
 * import { Hono } from "hono";
 * import { HonoWithConvex, HttpRouterWithHono } from "convex-helpers/server/hono";
 * import { ActionCtx } from "./_generated/server";
 *
 * const app: HonoWithConvex<ActionCtx> = new Hono();
 *
 * app.get("/", async (c) => {
 *   return c.json("Hello world!");
 * });
 *
 * export default new HttpRouterWithHono(app);
 * ```
 */
import type { RoutableMethod, GenericActionCtx } from "convex/server";
import { HttpRouter } from "convex/server";
import { Hono } from "hono";
export { Hono };
/**
 * Hono uses the `FetchEvent` type internally, which has to do with service workers
 * and isn't included in the Convex tsconfig.
 *
 * As a workaround, define this type here so Hono + Convex compiles.
 */
declare global {
    type FetchEvent = any;
}
/**
 * A type representing a Hono app with `c.env` containing Convex's
 * `HttpEndpointCtx` (e.g. `c.env.runQuery` is valid).
 */
export type HonoWithConvex<ActionCtx extends GenericActionCtx<any>> = Hono<{
    Bindings: {
        [Name in keyof ActionCtx]: ActionCtx[Name];
    };
}>;
/**
 * An implementation of the Convex `HttpRouter` that integrates with Hono by
 * overriding getRoutes and lookup.
 *
 * This allows you to use both Hono routes and traditional Convex HTTP routes together.
 * Traditional Convex routes (registered via http.route()) are checked first, then
 * Hono routes are used as a fallback.
 *
 * For example:
 *
 * ```
 * const app: HonoWithConvex = new Hono();
 * app.get("/hono/hello", (c) => c.json({ message: "from hono" }));
 *
 * const http = new HttpRouterWithHono(app);
 * http.route({
 *   path: "/convex/hello",
 *   method: "GET",
 *   handler: httpAction(() => new Response("from convex"))
 * });
 *
 * export default http;
 * ```
 */
export declare class HttpRouterWithHono<ActionCtx extends GenericActionCtx<any>> extends HttpRouter {
    private _app;
    private _handler;
    private _handlerInfoCache;
    constructor(app: HonoWithConvex<ActionCtx>);
    /**
     * Get routes from the Hono app.
     */
    private getHonoRoutes;
    /**
     * Returns the hono HTTP endpoint and its routed request path and method.
     *
     * The path and method returned are used for logging and metrics, and should
     * match up with one of the routes returned by `getRoutes`.
     *
     * For example,
     *
     * ```js
     * http.route({ pathPrefix: "/profile/", method: "GET", handler: getProfile});
     *
     * http.lookup("/profile/abc", "GET") // returns [getProfile, "GET", "/profile/*"]
     *```
     */
    private lookupHonoRoute;
}
export declare function normalizeMethod(method: RoutableMethod | "HEAD"): RoutableMethod;
//# sourceMappingURL=hono.d.ts.map