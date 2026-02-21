import { httpActionGeneric, HttpRouter, ROUTABLE_HTTP_METHODS, } from "convex/server";
import { Hono } from "hono";
export { Hono };
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
export class HttpRouterWithHono extends HttpRouter {
    _app;
    _handler;
    _handlerInfoCache;
    constructor(app) {
        super();
        this._app = app;
        // Single Convex httpEndpoint handler that just forwards the request to the
        // Hono framework
        this._handler = httpActionGeneric(async (ctx, request) => {
            return await app.fetch(request, ctx);
        });
        this._handlerInfoCache = new Map();
        // Save reference to parent getRoutes before overriding
        const parentGetRoutes = this.getRoutes.bind(this);
        this.getRoutes = () => {
            const parentRoutes = parentGetRoutes();
            const honoRoutes = this.getHonoRoutes();
            return [...parentRoutes, ...honoRoutes];
        };
        // Save reference to parent lookup before overriding
        const parentLookup = this.lookup.bind(this);
        this.lookup = (path, method) => {
            // First check parent router for traditional Convex routes
            const convexMatch = parentLookup(path, method);
            if (convexMatch !== null) {
                return convexMatch;
            }
            // Fall back to Hono routing
            return this.lookupHonoRoute(path, method);
        };
    }
    /**
     * Get routes from the Hono app.
     */
    getHonoRoutes() {
        const honoRoutes = [];
        // Likely a better way to do this, but hono will have multiple handlers with the same
        // name (i.e. for middleware), so de-duplicate so we don't show multiple routes in the dashboard.
        const seen = new Set();
        this._app.routes.forEach((route) => {
            // The (internal) field _handler on PublicHttpAction is used to look up the function's line number.
            const handler = route.handler;
            handler._handler = route.handler;
            handler.isHttp = true;
            // Hono uses "ALL" in its router, which is not supported by the Convex router.
            // Expand this into a route for every routable method supported by Convex.
            if (route.method === "ALL") {
                for (const method of ROUTABLE_HTTP_METHODS) {
                    const name = `${method} ${route.path}`;
                    if (!seen.has(name)) {
                        seen.add(name);
                        honoRoutes.push([route.path, method, handler]);
                    }
                }
            }
            else {
                const name = `${route.method} ${route.path}`;
                if (!seen.has(name)) {
                    seen.add(name);
                    honoRoutes.push([
                        route.path,
                        route.method,
                        handler,
                    ]);
                }
            }
        });
        return honoRoutes;
    }
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
    lookupHonoRoute(path, method) {
        const match = this._app.router.match(method, path);
        if (match === null) {
            return [this._handler, normalizeMethod(method), path];
        }
        // There might be multiple handlers for a route (in the case of middleware),
        // so choose the most specific one for the purposes of logging
        const handlersAndRoutes = match[0];
        if (!handlersAndRoutes?.length) {
            return [this._handler, normalizeMethod(method), path];
        }
        const mostSpecificHandler = handlersAndRoutes[handlersAndRoutes.length - 1][0][0];
        // On the first request let's populate a lookup from handler to info
        if (this._handlerInfoCache.size === 0) {
            for (const r of this._app.routes) {
                this._handlerInfoCache.set(r.handler, {
                    method: normalizeMethod(method),
                    path: r.path,
                });
            }
        }
        const info = this._handlerInfoCache.get(mostSpecificHandler);
        if (info) {
            return [this._handler, info.method, info.path];
        }
        return [this._handler, normalizeMethod(method), path];
    }
}
export function normalizeMethod(method) {
    // HEAD is handled by Convex by running GET and stripping the body.
    if (method === "HEAD")
        return "GET";
    return method;
}
