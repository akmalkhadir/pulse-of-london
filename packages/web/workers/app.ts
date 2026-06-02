import { createRequestHandler } from "react-router";

// Cloudflare Workers entry. The Vite/RR7 build provides the server build via the
// virtual module; we hand the worker `env` (bindings/vars) to loaders as
// `context.cloudflare.env`. Typed loosely to avoid DOM-vs-Workers global clashes.
const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request: Request, env: Record<string, string | undefined>, ctx: unknown) {
    return requestHandler(request, { cloudflare: { env, ctx } });
  },
};
