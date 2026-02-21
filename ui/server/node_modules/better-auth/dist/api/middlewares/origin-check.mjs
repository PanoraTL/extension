import { APIError } from "better-call";
import { createAuthMiddleware } from "@better-auth/core/api";

//#region src/api/middlewares/origin-check.ts
/**
* A middleware to validate callbackURL and origin against
* trustedOrigins.
*/
const originCheckMiddleware = createAuthMiddleware(async (ctx) => {
	if (ctx.request?.method === "GET" || ctx.request?.method === "OPTIONS" || ctx.request?.method === "HEAD" || !ctx.request) return;
	const headers = ctx.request?.headers;
	const { body, query } = ctx;
	const originHeader = headers?.get("origin") || headers?.get("referer") || "";
	const callbackURL = body?.callbackURL || query?.callbackURL;
	const redirectURL = body?.redirectTo;
	const errorCallbackURL = body?.errorCallbackURL;
	const newUserCallbackURL = body?.newUserCallbackURL;
	const useCookies = headers?.has("cookie");
	const validateURL = (url, label) => {
		if (!url) return;
		if (!ctx.context.isTrustedOrigin(url, { allowRelativePaths: label !== "origin" })) {
			ctx.context.logger.error(`Invalid ${label}: ${url}`);
			ctx.context.logger.info(`If it's a valid URL, please add ${url} to trustedOrigins in your auth config\n`, `Current list of trustedOrigins: ${ctx.context.trustedOrigins}`);
			throw new APIError("FORBIDDEN", { message: `Invalid ${label}` });
		}
	};
	if (useCookies && !ctx.context.skipCSRFCheck && !ctx.context.skipOriginCheck) {
		if (!originHeader || originHeader === "null") throw new APIError("FORBIDDEN", { message: "Missing or null Origin" });
		validateURL(originHeader, "origin");
	}
	callbackURL && validateURL(callbackURL, "callbackURL");
	redirectURL && validateURL(redirectURL, "redirectURL");
	errorCallbackURL && validateURL(errorCallbackURL, "errorCallbackURL");
	newUserCallbackURL && validateURL(newUserCallbackURL, "newUserCallbackURL");
});
const originCheck = (getValue) => createAuthMiddleware(async (ctx) => {
	if (!ctx.request) return;
	const callbackURL = getValue(ctx);
	const validateURL = (url, label) => {
		if (!url) return;
		if (!ctx.context.isTrustedOrigin(url, { allowRelativePaths: label !== "origin" })) {
			ctx.context.logger.error(`Invalid ${label}: ${url}`);
			ctx.context.logger.info(`If it's a valid URL, please add ${url} to trustedOrigins in your auth config\n`, `Current list of trustedOrigins: ${ctx.context.trustedOrigins}`);
			throw new APIError("FORBIDDEN", { message: `Invalid ${label}` });
		}
	};
	const callbacks = Array.isArray(callbackURL) ? callbackURL : [callbackURL];
	for (const url of callbacks) validateURL(url, "callbackURL");
});

//#endregion
export { originCheck, originCheckMiddleware };
//# sourceMappingURL=origin-check.mjs.map