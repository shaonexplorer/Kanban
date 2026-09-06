// server/scripts/audit-routes.mts
//
// Phase 5 Step 7 — Input Validation Audit.
//
// Walks the live Express route table (built by `createApp()`) and
// asserts that every non-public route has at least one `validate(...)`
// middleware in front of the controller handler. Exits 1 on a miss so
// CI / `npm run lint` can fail the build.
//
// "Non-public" = anything that is not:
//   - GET  /health                  (liveness probe, no params, no body)
//   - POST /api/auth/register       (validate() IS present — explicitly
//                                    excluded so the audit doesn't
//                                    complain about routes the public
//                                    is allowed to hit with garbage)
//   - POST /api/auth/login          (same)
//
// The check is structural, not behavioural: it only inspects the
// middleware chain, not the request or the response. A route that
// does `validate(Schema, "params")` on a UUID path AND a body
// `validate(BodySchema)` is recorded as both `params` and `body` so
// the report makes the coverage explicit.
//
// Why we hardcode MOUNT_PATHS:
//   Express 5's `Router` stores each layer's mount path only inside
//   the matching regex (`layer.matchers[0]`) and resets `layer.path`
//   to `undefined` after every request. There is no public-API way to
//   recover the mount prefix from the layer's `path` property at
//   audit time. Rather than infer it from regex inspection (fragile
//   across Express minor versions), we keep an explicit
//   `MOUNT_PATHS` map here that mirrors `src/app.ts`'s `app.use(...)`
//   calls. If `src/app.ts` changes (a new mount, a moved prefix),
//   update this map at the same time.
//
// Run with:
//   npx tsx scripts/audit-routes.mts          (local dev)
//   npm run lint                              (CI — runs tsc + this script)
//
// The script imports the TypeScript app source via `tsx`'s native
// ESM resolver, so the `.js` import specifiers in `src/app.ts` and
// its dependencies resolve correctly. It does NOT start the server
// (no `app.listen`), so no port conflict with `npm run dev` and no
// DB connection is opened at runtime — but the import does load the
// Prisma client module, which is fine on a developer machine.

import process from "node:process";

// We import the source as a relative path with the `.js` extension
// the rest of the project uses. `tsx` rewrites this to the `.ts`
// source at runtime via its loader hooks.
import createApp from "../src/app.js";

// ---- 1. Mount-path map (mirror of src/app.ts) ----
//
// Keyed by the ROUTER OBJECT'S IDENTITY. We compare via reference
// (`router === entry.router`) so we don't rely on name. Each entry
// pairs the router with the mount path `src/app.ts` registered it
// under. Keep this in sync with the `app.use(...)` calls in
// `src/app.ts`.
//
// To wire a router into the audit, import it here the same way
// `src/app.ts` does and add an entry to MOUNT_PATHS.
import { authRouter } from "../src/modules/auth/index.js";
import { boardsRouter } from "../src/modules/boards/index.js";
import { boardInvitationsRouter } from "../src/modules/board-invitations/index.js";
import { columnsRouter } from "../src/modules/columns/index.js";
import { healthRouter } from "../src/modules/health/index.js";
import { tasksRouter } from "../src/modules/tasks/index.js";

const MOUNT_PATHS: Array<{ router: any; path: string }> = [
  { router: healthRouter, path: "/health" },
  { router: authRouter, path: "/api/auth" },
  { router: boardsRouter, path: "/api/boards" },
  { router: boardInvitationsRouter, path: "/api/board-invitations" },
  { router: columnsRouter, path: "/api" },
  { router: tasksRouter, path: "/api" },
];

// ---- 2. Build the Express app via the same factory the server uses ----
const app = createApp();

// ---- 3. Public-route allowlist ----
//
// Routes that have NO request input the server can validate — they
// take no body, no path params, and no query string. The audit
// skip-list is the "legitimately empty" set:
//
//   - GET  /health                  — liveness probe.
//   - POST /api/auth/register       — has validate(registerSchema).
//   - POST /api/auth/login          — has validate(loginSchema).
//   - GET  /api/boards              — `listBoards` reads only `req.user.id`.
//   - GET  /api/board-invitations   — `listInvitations` reads only `req.user.id`.
//   - GET  /api/auth/me             — reads only `req.user` (set by authMiddleware
//                                     from the httpOnly `token` cookie). No body,
//                                     no path param, no query string. Added in
//                                     Phase 5 Step 8 (cookie auth migration).
//   - POST /api/auth/logout         — same: clears the `token` cookie and 204s.
//                                     Mounted behind `requireAuth`, but takes no
//                                     body/params/query — the cookie is the only
//                                     input and it's verified by authMiddleware.
//
// If a new "list everything I own" endpoint is added that doesn't
// accept any filter/pagination, add it here. If a future endpoint
// grows a `?status=…` filter or a `:id` param, drop the entry and
// add the appropriate `validate(...)` middleware in the route.
const PUBLIC_ROUTES = new Set<string>([
  "GET /health",
  "POST /api/auth/register",
  "POST /api/auth/login",
  "GET /api/boards",
  "GET /api/board-invitations",
  "GET /api/auth/me",
  "POST /api/auth/logout",
]);

// ---- 4. Walk each router's stack and collect its routes ----
//
// `router.stack` is the ordered list of layers for that router. A
// layer whose `layer.route` is set is a real route layer and carries
// its own `.stack` of middleware + handlers. We walk that inner
// stack to detect `validate(...)` middleware (the handler carries
// the `kanbanValidate` marker we attach in
// `src/common/validators/validate.middleware.ts`).
interface RouteInfo {
  method: string;
  path: string;
  stack: any[];
}

function collectRoutesFromRouter(router: any, mountPath: string): RouteInfo[] {
  const routes: RouteInfo[] = [];
  if (!router || !Array.isArray(router.stack)) return routes;
  for (const layer of router.stack) {
    if (!layer.route) continue;
    const m = layer.route.methods || {};
    const verbs = Object.keys(m).filter((k) => m[k] && k !== "_all");
    for (const verb of verbs) {
      routes.push({
        method: verb.toUpperCase(),
        path: joinPaths(mountPath, layer.route.path),
        stack: layer.route.stack,
      });
    }
  }
  return routes;
}

function joinPaths(a: string, b: string): string {
  if (!a) return b || "";
  if (!b) return a;
  if (a.endsWith("/") && b.startsWith("/")) return a + b.slice(1);
  if (!a.endsWith("/") && !b.startsWith("/")) return a + "/" + b;
  return a + b;
}

/**
 * Normalize a route path for reporting and allowlist lookup:
 *   - strip a trailing slash (Express normalizes both `/x` and
 *     `/x/` to the same route, so `/health` and `/health/` are the
 *     same route from the audit's point of view)
 *   - keep a single leading `/`
 */
function normalizePath(p: string): string {
  if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1);
  return p;
}

const allRoutes: RouteInfo[] = [];
for (const { router, path } of MOUNT_PATHS) {
  for (const r of collectRoutesFromRouter(router, path)) {
    allRoutes.push(r);
  }
}

// Deduplicate (in case two MOUNT_PATHS entries accidentally point at
// the same router — `columnsRouter` and `tasksRouter` are both
// mounted at `/api` and we want to report each route only once).
const seen = new Set<string>();
const uniqueRoutes: RouteInfo[] = [];
for (const r of allRoutes) {
  const key = `${r.method} ${r.path}`;
  if (seen.has(key)) continue;
  seen.add(key);
  uniqueRoutes.push(r);
}

// ---- 5. Inspect each route's middleware chain ----
//
// A route's `route.stack` is the ordered list of middleware +
// handler functions registered via `router.METHOD(path, mw1, mw2,
// ..., handler)`. We walk it and record:
//
//   - whether a `validate(...)` middleware is present
//     (detected via the `kanbanValidate` marker we attach in
//     `validate.middleware.ts`)
//   - the set of `source`s covered: "body" | "params" | "query"
//
// A route passes if it is in the public allowlist OR has at least one
// `validate()` in its chain.
interface PassEntry {
  key: string;
  public: boolean;
  sources: string[];
}
const failures: string[] = [];
const passes: PassEntry[] = [];

for (const { method, path, stack } of uniqueRoutes) {
  const key = `${method} ${normalizePath(path)}`;
  const sources = new Set<string>();
  let hasValidate = false;
  for (const layer of stack) {
    const handler = layer.handle;
    if (!handler) continue;
    const marker = (handler as any).kanbanValidate;
    if (marker) {
      hasValidate = true;
      sources.add(marker.source);
    }
  }
  const isPublic = PUBLIC_ROUTES.has(key);
  if (isPublic || hasValidate) {
    passes.push({ key, public: isPublic, sources: [...sources].sort() });
  } else {
    failures.push(key);
  }
}

// ---- 6. Report ----

const total = uniqueRoutes.length;
const coverage = total === 0 ? "0" : ((passes.length / total) * 100).toFixed(1);

console.log("");
console.log("Phase 5 Step 7 — Input Validation Audit");
console.log("=======================================");
console.log(`Routes discovered:     ${total}`);
console.log(`Public (allowlisted):  ${passes.filter((p) => p.public).length}`);
console.log(`Validate-covered:      ${passes.filter((p) => !p.public).length}`);
console.log(`Coverage (non-public): ${coverage}%`);
console.log("");

if (failures.length === 0) {
  console.log("✅ Every non-public route has at least one validate(...) middleware.");
  console.log("");
  // Show a per-route breakdown grouped by `source` coverage for
  // visibility — useful when a route only validates `body` but its
  // path has a UUID param that's never checked.
  const bySource: Record<string, number> = { body: 0, params: 0, query: 0, none: 0 };
  for (const p of passes) {
    if (p.sources.length === 0) {
      bySource.none++;
    } else {
      for (const s of p.sources) bySource[s] = (bySource[s] || 0) + 1;
    }
  }
  console.log("Validate coverage by source:");
  console.log(`  body:   ${bySource.body}`);
  console.log(`  params: ${bySource.params}`);
  console.log(`  query:  ${bySource.query}`);
  console.log("");
  // Print the full route list grouped by mount path so the developer
  // can see at a glance which mount is in scope.
  let currentMount = "";
  for (const r of uniqueRoutes) {
    const mount = r.path.split("/", 3).join("/");
    if (mount !== currentMount) {
      currentMount = mount;
      console.log(`  ${currentMount}`);
    }
    const sourcesLabel = passes
      .find((p) => p.key === `${r.method} ${normalizePath(r.path)}`)
      ?.sources.join("+") || "(public)";
    console.log(`    ${r.method.padEnd(7)} ${r.path.padEnd(50)} validate[${sourcesLabel}]`);
  }
  console.log("");
  process.exit(0);
}

console.error("❌ The following routes are missing validate(...):");
for (const key of failures) console.error(`   - ${key}`);
console.error("");
console.error("Add a `validate(SomeZodSchema)` (or `validate(SomeZodSchema, \"params\")`)");
console.error("middleware to each listed route. Routes that intentionally have no body or");
console.error("params (e.g. liveness probes) should be added to PUBLIC_ROUTES in this");
console.error("script with a justifying comment.");
process.exit(1);
