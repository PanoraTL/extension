import { MultiSessionConfig, multiSession } from "./index.mjs";
import { DBFieldAttribute } from "@better-auth/core/db";

//#region src/plugins/multi-session/client.d.ts
type MultiSessionClientOptions = {
  schema?: {
    user?: {
      additionalFields?: Record<string, DBFieldAttribute> | undefined;
    } | undefined;
    session?: {
      additionalFields?: Record<string, DBFieldAttribute> | undefined;
    } | undefined;
  } | undefined;
};
declare const multiSessionClient: <O extends MultiSessionClientOptions>(options?: O | undefined) => {
  id: "multi-session";
  $InferServerPlugin: ReturnType<typeof multiSession<O>>;
  atomListeners: {
    matcher(path: string): path is "/multi-session/set-active";
    signal: "$sessionSignal";
  }[];
};
//#endregion
export { MultiSessionClientOptions, multiSessionClient };
//# sourceMappingURL=client.d.mts.map