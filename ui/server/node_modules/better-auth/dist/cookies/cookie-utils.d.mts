//#region src/cookies/cookie-utils.d.ts
interface CookieAttributes {
  value: string;
  "max-age"?: number | undefined;
  expires?: Date | undefined;
  domain?: string | undefined;
  path?: string | undefined;
  secure?: boolean | undefined;
  httponly?: boolean | undefined;
  samesite?: ("strict" | "lax" | "none") | undefined;
  [key: string]: any;
}
declare function parseSetCookieHeader(setCookie: string): Map<string, CookieAttributes>;
declare function setCookieToHeader(headers: Headers): (context: {
  response: Response;
}) => void;
//#endregion
export { parseSetCookieHeader, setCookieToHeader };
//# sourceMappingURL=cookie-utils.d.mts.map