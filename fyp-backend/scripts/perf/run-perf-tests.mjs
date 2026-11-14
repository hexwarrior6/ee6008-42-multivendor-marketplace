#!/usr/bin/env node
/**
 * Performance harness (Week 10 / S5 acceptance):
 * verify that seller-analytics aggregation queries do not degrade
 * customer-facing (store) endpoint latency.
 *
 * Phases:
 *   1. baseline   — store endpoints measured alone
 *   2. analytics  — analytics endpoints measured alone (informational)
 *   3. mixed      — analytics load runs in the background while the same
 *                   store endpoints are measured again
 *
 * Verdict: the p95 increase of every store endpoint between baseline and
 * mixed must stay within the threshold (default 10%), and the mixed phase
 * must not produce request errors.
 *
 * The load generator is a closed-loop HTTP client built on node:http with
 * keep-alive agents: each connection issues the next request as soon as the
 * previous one completes, and every request latency is recorded so exact
 * percentiles (p50/p95/p99) can be reported. No third-party dependency is
 * required.
 *
 * Usage:
 *   node scripts/perf/run-perf-tests.mjs \
 *     [--base-url http://localhost:9000] [--duration 20] [--warmup 3] \
 *     [--store-connections 10] [--analytics-connections 5] [--threshold 0.1] \
 *     [--timeout 30000] [--out results.json] [--skip-admin]
 *
 * Admin credentials (required unless --skip-admin):
 *   PERF_ADMIN_EMAIL / PERF_ADMIN_PASSWORD
 *   Create a dedicated account first, e.g.:
 *     npx medusa user --email perf@example.com --password <secret>
 *   then grant platform-wide read scope (see docs/performance-tests.md).
 *
 * The publishable API key is resolved from PERF_PUBLISHABLE_KEY, the
 * storefront .env, or the api_key table via DATABASE_URL — in that order.
 */

import http from "node:http"
import https from "node:https"
import { readFile } from "node:fs/promises"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.resolve(__dirname, "..", "..")
const REPO_ROOT = path.resolve(BACKEND_ROOT, "..")

// ---------------------------------------------------------------------------
// CLI / environment configuration
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith("--")) continue
    const eq = arg.indexOf("=")
    if (eq > -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1)
    } else {
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith("--")) {
        out[arg.slice(2)] = next
        i++
      } else {
        out[arg.slice(2)] = "true"
      }
    }
  }
  return out
}

/** Minimal .env reader: KEY=VALUE lines, quotes stripped, no expansion. */
async function readEnvFile(filePath) {
  try {
    const raw = await readFile(filePath, "utf8")
    const vars = {}
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eq = trimmed.indexOf("=")
      if (eq < 1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      vars[key] = value
    }
    return vars
  } catch {
    return {}
  }
}

async function resolveConfig() {
  const args = parseArgs(process.argv.slice(2))
  const backendEnv = await readEnvFile(path.join(BACKEND_ROOT, ".env"))
  const storefrontEnv = await readEnvFile(
    path.join(REPO_ROOT, "fyp-storefront", ".env")
  )

  const numberOption = (name, fallback) => {
    const value = Number(args[name] ?? fallback)
    if (!Number.isFinite(value) || value < 0) {
      fail(`Invalid --${name}: ${args[name]}`)
    }
    return value
  }

  return {
    baseUrl: (args["base-url"] ?? "http://localhost:9000").replace(/\/$/, ""),
    duration: numberOption("duration", 20),
    warmup: numberOption("warmup", 3),
    threshold: numberOption("threshold", 0.1),
    storeConnections: numberOption("store-connections", 10),
    analyticsConnections: numberOption("analytics-connections", 5),
    requestTimeout: numberOption("timeout", 30000),
    skipAdmin: Boolean(args["skip-admin"]),
    analyticsInclude: args["analytics-include"]
      ? String(args["analytics-include"])
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : null,
    outFile: args.out ?? null,
    publishableKey:
      process.env.PERF_PUBLISHABLE_KEY ??
      storefrontEnv.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ??
      storefrontEnv.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_API_KEY ??
      null,
    databaseUrl: process.env.DATABASE_URL ?? backendEnv.DATABASE_URL ?? null,
    adminEmail: process.env.PERF_ADMIN_EMAIL ?? null,
    adminPassword: process.env.PERF_ADMIN_PASSWORD ?? null,
  }
}

function fail(message) {
  console.error(`[perf] ${message}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Credentials discovery
// ---------------------------------------------------------------------------

async function lookupPublishableKeyInDb(databaseUrl) {
  if (!databaseUrl) return null
  let Client
  try {
    const pg = await import("@medusajs/framework/pg")
    // CJS re-export: the constructor lives on the default export.
    Client = pg.default?.Client ?? pg.Client
  } catch {
    return null
  }
  if (typeof Client !== "function") return null
  const client = new Client({ connectionString: databaseUrl })
  try {
    await client.connect()
    const { rows } = await client.query(
      "SELECT token FROM api_key WHERE type = 'publishable' AND revoked_at IS NULL ORDER BY created_at ASC LIMIT 1"
    )
    return rows[0]?.token ?? null
  } catch (error) {
    console.warn(`[perf] publishable key DB lookup failed: ${error.message}`)
    return null
  } finally {
    await client.end().catch(() => {})
  }
}

async function adminLogin(baseUrl, email, password) {
  const response = await fetch(`${baseUrl}/auth/user/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) {
    fail(
      `Admin login failed with HTTP ${response.status}. Check PERF_ADMIN_EMAIL / PERF_ADMIN_PASSWORD.`
    )
  }
  const body = await response.json()
  if (!body.token) fail("Admin login response did not contain a token.")
  return body.token
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function healthCheck(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/health`)
    if (response.ok) return
    fail(`/health answered HTTP ${response.status}; is the backend running?`)
  } catch (error) {
    fail(`Cannot reach ${baseUrl} (${error.message}). Start the backend first.`)
  }
}

async function warmup(url, headers, requests) {
  for (let i = 0; i < requests; i++) {
    try {
      await fetch(url, { headers })
    } catch {
      // Warmup errors are ignored; the measured phase reports them.
    }
  }
}

// ---------------------------------------------------------------------------
// Closed-loop load generator
// ---------------------------------------------------------------------------

const percentile = (sorted, q) => {
  if (!sorted.length) return null
  const index = Math.min(sorted.length - 1, Math.floor((q / 100) * sorted.length))
  return sorted[index]
}

/** One sequential request loop; returns when the deadline passes or stop() fires. */
async function connectionLoop(clientModule, agent, target, state) {
  while (!state.stopped && Date.now() < state.deadline) {
    const started = process.hrtime.bigint()
    try {
      const statusCode = await new Promise((resolve, reject) => {
        const request = clientModule.request(
          target.url,
          { method: "GET", headers: target.headers, agent },
          (response) => {
            response.resume()
            response.on("end", () => resolve(response.statusCode))
            response.on("error", reject)
          }
        )
        request.setTimeout(state.requestTimeout, () =>
          request.destroy(new Error("request timeout"))
        )
        request.on("error", reject)
        request.end()
      })
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6
      state.total += 1
      state.latencies.push(elapsedMs)
      if (statusCode < 200 || statusCode >= 300) state.non2xx += 1
    } catch {
      state.errors += 1
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
}

function summarize(state, durationSeconds) {
  const sorted = [...state.latencies].sort((a, b) => a - b)
  const mean =
    sorted.length > 0
      ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length
      : null
  return {
    p50_ms: percentile(sorted, 50),
    p95_ms: percentile(sorted, 95),
    p99_ms: percentile(sorted, 99),
    mean_ms: mean,
    max_ms: sorted.length ? sorted[sorted.length - 1] : null,
    rps: durationSeconds > 0 ? Math.round(state.total / durationSeconds) : 0,
    errors: state.errors,
    non2xx: state.non2xx,
  }
}

/**
 * Drive a target with N closed-loop connections for `duration` seconds.
 * Returns the summary once the run finishes.
 */
async function runLoad(target, durationSeconds) {
  const clientModule = target.url.startsWith("https") ? https : http
  const state = {
    stopped: false,
    deadline: Date.now() + durationSeconds * 1000,
    requestTimeout: target.requestTimeout,
    total: 0,
    errors: 0,
    non2xx: 0,
    latencies: [],
  }
  const agent = new clientModule.Agent({
    keepAlive: true,
    maxSockets: target.connections,
    maxFreeSockets: target.connections,
  })
  try {
    await Promise.all(
      Array.from({ length: target.connections }, () =>
        connectionLoop(clientModule, agent, target, state)
      )
    )
  } finally {
    agent.destroy()
  }
  return summarize(state, durationSeconds)
}

/**
 * Drive a target until stop() is called (background load); returns
 * { stop, done } where done resolves with the summary of what ran.
 */
function startLoad(target, maxSeconds = 600) {
  const state = {
    stopped: false,
    deadline: Date.now() + maxSeconds * 1000,
    requestTimeout: target.requestTimeout,
    total: 0,
    errors: 0,
    non2xx: 0,
    latencies: [],
  }
  const clientModule = target.url.startsWith("https") ? https : http
  const agent = new clientModule.Agent({
    keepAlive: true,
    maxSockets: target.connections,
    maxFreeSockets: target.connections,
  })
  const loops = Array.from({ length: target.connections }, () =>
    connectionLoop(clientModule, agent, target, state)
  )
  const startedAt = Date.now()
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    state.stopped = true
  }
  const done = Promise.all(loops)
    .catch(() => {})
    .then(() => {
      agent.destroy()
      return summarize(state, (Date.now() - startedAt) / 1000)
    })
  return { stop: finish, done }
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

async function discoverProductId(baseUrl, publishableKey) {
  const headers = { "x-publishable-api-key": publishableKey }
  const response = await fetch(`${baseUrl}/store/products?limit=1`, { headers })
  if (!response.ok) return null
  const body = await response.json()
  return body.products?.[0]?.id ?? null
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const fmtMs = (value) => (value === null ? "n/a" : value.toFixed(1))
const fmtPct = (value) =>
  value === null ? "n/a" : `${(value * 100).toFixed(1)}%`

function printStats(label, stats) {
  console.log(
    `  ${label.padEnd(38)} p95 ${fmtMs(stats.p95_ms).padStart(9)} ms   ` +
      `mean ${fmtMs(stats.mean_ms).padStart(9)} ms   ` +
      `rps ${String(stats.rps).padStart(6)}   ` +
      `err ${stats.errors}   non2xx ${stats.non2xx}`
  )
}

function compareStoreTargets(baseline, mixed, threshold) {
  const rows = []
  for (const target of Object.keys(baseline)) {
    const before = baseline[target].p95_ms
    const after = mixed[target]?.p95_ms ?? null
    const degradation =
      before !== null && after !== null && before > 0
        ? (after - before) / before
        : null
    rows.push({
      target,
      baseline_p95_ms: before,
      mixed_p95_ms: after,
      degradation,
      passed:
        degradation !== null &&
        degradation <= threshold &&
        (mixed[target]?.errors ?? 0) === 0 &&
        (mixed[target]?.non2xx ?? 0) === 0,
    })
  }
  return rows
}

function printVerdict(rows, threshold) {
  console.log(
    `\nStore p95 degradation under analytics load (threshold ${fmtPct(threshold)}):`
  )
  for (const row of rows) {
    const status = row.passed ? "PASS" : "FAIL"
    console.log(
      `  [${status}] ${row.target}: p95 ${fmtMs(row.baseline_p95_ms)} -> ` +
        `${fmtMs(row.mixed_p95_ms)} ms (${fmtPct(row.degradation)})`
    )
  }
  const passed = rows.length > 0 && rows.every((row) => row.passed)
  console.log(
    passed
      ? "\nVerdict: PASS — analytics queries did not degrade storefront latency beyond the threshold."
      : "\nVerdict: FAIL — storefront latency degraded beyond the threshold or measurement incomplete."
  )
  return passed
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = await resolveConfig()
  console.log(
    `[perf] target ${config.baseUrl} | ${config.duration}s per measurement | ` +
      `store x${config.storeConnections} conn | analytics x${config.analyticsConnections} conn | ` +
      `threshold ${fmtPct(config.threshold)}`
  )
  await healthCheck(config.baseUrl)

  const publishableKey =
    config.publishableKey ??
    (await lookupPublishableKeyInDb(config.databaseUrl))
  if (!publishableKey) {
    fail(
      "No publishable API key found. Set PERF_PUBLISHABLE_KEY, add it to " +
        "fyp-storefront/.env, or run: pnpm medusa exec src/scripts/ensure-publishable-key.ts"
    )
  }

  const storeHeaders = { "x-publishable-api-key": publishableKey }
  const productId = await discoverProductId(config.baseUrl, publishableKey)

  const storeTargets = [
    {
      name: "GET /store/products (list, limit=12)",
      url: `${config.baseUrl}/store/products?limit=12`,
      headers: storeHeaders,
      connections: config.storeConnections,
      requestTimeout: config.requestTimeout,
    },
  ]
  if (productId) {
    storeTargets.push({
      name: `GET /store/products/:id (${productId.slice(0, 8)}…)`,
      url: `${config.baseUrl}/store/products/${productId}`,
      headers: storeHeaders,
      connections: config.storeConnections,
      requestTimeout: config.requestTimeout,
    })
  } else {
    console.warn("[perf] no product found; product detail target skipped")
  }

  let analyticsTargets = []
  if (!config.skipAdmin) {
    if (!config.adminEmail || !config.adminPassword) {
      fail(
        "Admin credentials missing. Set PERF_ADMIN_EMAIL and PERF_ADMIN_PASSWORD " +
          "(create an account with: npx medusa user --email ... --password ...), " +
          "or run with --skip-admin to measure the store baseline only."
      )
    }
    const token = await adminLogin(
      config.baseUrl,
      config.adminEmail,
      config.adminPassword
    )
    const adminHeaders = { authorization: `Bearer ${token}` }
    const today = new Date().toISOString().slice(0, 10)
    const daysAgo = (days) =>
      new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    analyticsTargets = [
      {
        name: "GET /admin/analytics/sales (90d)",
        url: `${config.baseUrl}/admin/analytics/sales?from=${daysAgo(90)}&to=${today}&currency_code=cny`,
        headers: adminHeaders,
        connections: config.analyticsConnections,
        requestTimeout: config.requestTimeout,
      },
      {
        name: "GET /admin/analytics/sales (30d)",
        url: `${config.baseUrl}/admin/analytics/sales?from=${daysAgo(30)}&to=${today}&currency_code=cny`,
        headers: adminHeaders,
        connections: config.analyticsConnections,
        requestTimeout: config.requestTimeout,
      },
      {
        name: "GET /admin/analytics/custom-orders (90d)",
        url: `${config.baseUrl}/admin/analytics/custom-orders?from=${daysAgo(90)}&to=${today}&currency_code=cny`,
        headers: adminHeaders,
        connections: config.analyticsConnections,
        requestTimeout: config.requestTimeout,
      },
    ]
    if (config.analyticsInclude) {
      analyticsTargets = analyticsTargets.filter((target) =>
        config.analyticsInclude.some((needle) => target.name.includes(needle))
      )
      if (!analyticsTargets.length) {
        fail(
          `--analytics-include ${config.analyticsInclude.join(",")} matched none of the analytics targets.`
        )
      }
      console.log(
        `[perf] analytics targets filtered to: ${analyticsTargets.map((t) => t.name).join(" | ")}`
      )
    }
  }

  // --- Phase 1: store baseline --------------------------------------------
  console.log("\nPhase 1/3 — baseline (store endpoints alone):")
  const baseline = {}
  for (const target of storeTargets) {
    await warmup(target.url, target.headers, config.warmup)
    baseline[target.name] = await runLoad(target, config.duration)
    printStats(target.name, baseline[target.name])
  }

  // --- Phase 2: analytics alone (informational) ----------------------------
  const analytics = {}
  if (analyticsTargets.length) {
    console.log("\nPhase 2/3 — analytics endpoints alone (informational):")
    for (const target of analyticsTargets) {
      await warmup(target.url, target.headers, config.warmup)
      analytics[target.name] = await runLoad(target, config.duration)
      printStats(target.name, analytics[target.name])
    }
  }

  // --- Phase 3: store under analytics load ---------------------------------
  console.log("\nPhase 3/3 — mixed (store measured while analytics load runs):")
  const background = []
  for (const target of analyticsTargets) {
    await warmup(target.url, target.headers, config.warmup)
    background.push({ target, ...startLoad(target) })
  }
  const mixed = {}
  try {
    for (const target of storeTargets) {
      await warmup(target.url, target.headers, config.warmup)
      mixed[target.name] = await runLoad(target, config.duration)
      printStats(target.name, mixed[target.name])
    }
  } finally {
    for (const entry of background) entry.stop()
  }
  for (const entry of background) {
    const result = await entry.done
    analytics[`mixed ${entry.target.name}`] = result
    printStats(`↳ under load: ${entry.target.name}`, result)
  }

  // --- Verdict --------------------------------------------------------------
  // Analytics endpoints returning non-2xx make the background load
  // unrepresentative (cheap failures instead of real aggregation work),
  // so the run can only be certified when they all succeed.
  const brokenAnalytics = Object.entries(analytics).filter(
    ([name, stats]) =>
      !name.startsWith("mixed ") && (stats.non2xx > 0 || stats.errors > 0)
  )
  const rows = compareStoreTargets(baseline, mixed, config.threshold)
  let passed = printVerdict(rows, config.threshold)
  if (brokenAnalytics.length) {
    passed = false
    console.log(
      `\n[perf] BLOCKED: analytics endpoints returned errors during load — ` +
        brokenAnalytics.map(([name, stats]) => `${name} (non2xx ${stats.non2xx})`).join(", ") +
        `. The mixed-phase comparison is not representative; fix the endpoints and re-run.`
    )
  }

  const verdict = brokenAnalytics.length ? "BLOCKED" : passed ? "PASS" : "FAIL"

  if (config.outFile) {
    const report = {
      generated_at: new Date().toISOString(),
      config: {
        base_url: config.baseUrl,
        duration_seconds: config.duration,
        store_connections: config.storeConnections,
        analytics_connections: config.analyticsConnections,
        threshold: config.threshold,
        skip_admin: config.skipAdmin,
      },
      baseline,
      analytics,
      mixed,
      store_comparison: rows,
      verdict,
    }
    writeFileSync(config.outFile, JSON.stringify(report, null, 2))
    console.log(`\n[perf] results written to ${config.outFile}`)
  }

  process.exitCode = verdict === "PASS" ? 0 : verdict === "BLOCKED" ? 2 : 1
}

main().catch((error) => fail(error?.stack ?? error?.message ?? String(error)))
