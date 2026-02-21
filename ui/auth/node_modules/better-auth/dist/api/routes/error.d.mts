import * as better_call893 from "better-call";

//#region src/api/routes/error.d.ts
declare const error: better_call893.StrictEndpoint<"/error", {
  method: "GET";
  metadata: {
    openapi: {
      description: string;
      responses: {
        "200": {
          description: string;
          content: {
            "text/html": {
              schema: {
                type: "string";
                description: string;
              };
            };
          };
        };
      };
    };
    scope: "server";
  };
}, Response>;
//#endregion
export { error };
//# sourceMappingURL=error.d.mts.map