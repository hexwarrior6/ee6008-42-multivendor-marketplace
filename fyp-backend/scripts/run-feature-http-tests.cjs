const { randomBytes, randomUUID } = require("node:crypto")
const { spawn } = require("node:child_process")
const { Client } = require("@medusajs/framework/pg")

/** Only a freshly generated, preflight-absent database is ever cleaned up. */
async function runFeatureHttpTests() {
  if (!process.env.TEST_DATABASE_URL)
    throw new Error(
      "Set TEST_DATABASE_URL explicitly. DATABASE_URL is never used automatically."
    )
  const source = new URL(process.env.TEST_DATABASE_URL)
  if (!["postgres:", "postgresql:"].includes(source.protocol))
    throw new Error("TEST_DATABASE_URL must be a PostgreSQL URL")
  const databaseName = `medusa_feature_test_${randomUUID().replace(/-/g, "")}`
  if (
    !/^medusa_feature_test_[a-f0-9]{32}$/.test(databaseName) ||
    source.pathname.slice(1) === databaseName
  )
    throw new Error("Unsafe test database name")
  const username = decodeURIComponent(source.username)
  const password = decodeURIComponent(source.password)
  // Medusa test-utils constructs the URL without encoding credentials.
  if (
    encodeURIComponent(username) !== username ||
    encodeURIComponent(password) !== password
  )
    throw new Error(
      "This Medusa test runner requires URL-safe test credentials"
    )
  const admin = new Client({
    connectionString: source.href,
    connectionTimeoutMillis: 10000,
  })
  let ownsDatabase = false
  try {
    await admin.connect()
    const { rows } = await admin.query(
      "select datname from pg_database where datname = $1",
      [databaseName]
    )
    if (rows.length)
      throw new Error(
        "Generated test database already exists; refusing to use or clean it"
      )
    const role = await admin.query(
      "select rolcreatedb from pg_roles where rolname = current_user"
    )
    if (!role.rows[0]?.rolcreatedb)
      throw new Error(
        "Test account requires permission to create an isolated database"
      )
    const target = new URL(source.href)
    target.pathname = `/${databaseName}`
    const env = {
      ...process.env,
      NODE_ENV: "test",
      TEST_TYPE: "integration:http",
      NODE_OPTIONS: `${
        process.env.NODE_OPTIONS || ""
      } --experimental-vm-modules`.trim(),
      FEATURE_TEST_DB_NAME: databaseName,
      DATABASE_URL: target.href,
      DB_HOST: source.hostname,
      DB_PORT: source.port || "5432",
      DB_USERNAME: username,
      DB_PASSWORD: password,
      PORT: "",
      REDIS_URL: "",
      MINIO_ENABLED: "false",
      RESEND_API_KEY: "",
      RESEND_FROM_EMAIL: "",
      STRIPE_API_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      TALKJS_APP_ID: "",
      TALKJS_SECRET_KEY: "",
      RECOMMENDATIONS_FILE: "",
      RECOMMENDATIONS_API_URL: "",
      RECOMMENDATIONS_API_KEY: "",
      RECOMMENDATIONS_MAX_AGE_SECONDS: "86400",
      WECHAT_PAY_ENABLED: "true",
      WECHAT_PAY_SANDBOX: "true",
      WECHAT_PAY_MODE: "mock",
      CUSTOM_ORDER_LIVE_PAYMENTS_ENABLED: "false",
      CUSTOM_ORDER_LIVE_REFUNDS_ENABLED: "false",
      JWT_SECRET: randomBytes(32).toString("hex"),
      COOKIE_SECRET: randomBytes(32).toString("hex"),
    }
    // Redact credentials even when a third-party initialization error logs a URL.
    const secrets = [
      ...new Set(
        [
          password,
          source.href,
          target.href,
          env.JWT_SECRET,
          env.COOKIE_SECRET,
          ...Object.entries(process.env)
            .filter(([key]) => /SECRET|PASSWORD|API_KEY|TOKEN/.test(key))
            .map(([, value]) => value),
        ].filter((value) => typeof value === "string" && value.length >= 4)
      ),
    ].sort((a, b) => b.length - a.length)
    const redact = (chunk) =>
      secrets.reduce(
        (text, value) => text.split(value).join("<REDACTED>"),
        String(chunk)
      )
    console.log(
      `Isolated test database: ${databaseName}; external providers disabled`
    )
    ownsDatabase = true
    const code = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "node_modules/jest/bin/jest.js",
          "--runInBand",
          "--forceExit",
          "--testMatch",
          "**/integration-tests/http/*.feature.ts",
          "--runTestsByPath",
          "integration-tests/http/feature-completion.feature.ts",
        ],
        { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
      )
      child.stdout.on("data", (data) => process.stdout.write(redact(data)))
      child.stderr.on("data", (data) => process.stderr.write(redact(data)))
      let interrupted = false
      const stop = () => {
        interrupted = true
        child.kill("SIGTERM")
      }
      const timeout = setTimeout(stop, 15 * 60 * 1000)
      process.once("SIGINT", stop)
      process.once("SIGTERM", stop)
      const detach = () => {
        clearTimeout(timeout)
        process.removeListener("SIGINT", stop)
        process.removeListener("SIGTERM", stop)
      }
      child.on("error", (error) => {
        detach()
        reject(error)
      })
      child.on("close", (exitCode) => {
        detach()
        resolve(interrupted ? 130 : exitCode ?? 1)
      })
    })
    if (code !== 0) throw new Error("Feature HTTP integration tests failed")
  } finally {
    try {
      if (ownsDatabase) {
        const existing = await admin.query(
          "select datname from pg_database where datname = $1",
          [databaseName]
        )
        if (existing.rows.length) {
          // Scope every termination and DROP to the one validated per-run name.
          await admin.query(
            "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
            [databaseName]
          )
          await admin.query(`DROP DATABASE "${databaseName}"`)
        }
        console.log(`Cleaned isolated test database: ${databaseName}`)
      }
    } finally {
      await admin.end()
    }
  }
}

module.exports = { runFeatureHttpTests }
if (require.main === module)
  runFeatureHttpTests().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
