import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  // The @cloudflare/vite-plugin drives SSR through Vite's Environment API; align
  // React Router's build flow with it (otherwise the client manifest isn't found).
  future: { v8_viteEnvironmentApi: true },
} satisfies Config;
