import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("api/snapshot", "routes/api.snapshot.ts"),
] satisfies RouteConfig;
