const assert = require("node:assert/strict")
const fs = require("node:fs")
const Module = require("node:module")
const path = require("node:path")
const test = require("node:test")
const ts = require("typescript")

function loadTsModule(sourcePath) {
  if (!fs.existsSync(sourcePath)) {
    return {}
  }

  const source = fs.readFileSync(sourcePath, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: sourcePath,
  }).outputText
  const subject = new Module(sourcePath, module)
  subject.filename = sourcePath
  subject.paths = module.paths
  subject._compile(compiled, sourcePath)
  return subject.exports
}

const requestSubject = loadTsModule(
  path.resolve(__dirname, "../src/lib/util/custom-order-request.ts")
)
const trackingSubject = loadTsModule(
  path.resolve(__dirname, "../src/lib/util/custom-order-status.ts")
)

const backendStateMachineSource = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../fyp-backend/src/modules/custom-order/state-machine.ts"
  ),
  "utf8"
)
const backendRouteSource = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../fyp-backend/src/api/store/custom-orders/route.ts"
  ),
  "utf8"
)

const { buildCustomOrderPayload } = requestSubject
const { getCustomOrderTimeline } = trackingSubject

test("builds the API payload and converts a display budget to minor units", () => {
  assert.equal(typeof buildCustomOrderPayload, "function")

  const formData = new FormData()
  formData.set("artisan_id", " art_123 ")
  formData.set("title", " Ceramic tea set ")
  formData.set("product_category", " Ceramics ")
  formData.set("description", " Four handmade cups and one teapot. ")
  formData.set("budget_amount", "68.50")
  formData.set("currency_code", "SGD")

  assert.deepEqual(buildCustomOrderPayload(formData), {
    artisan_id: "art_123",
    title: "Ceramic tea set",
    product_category: "Ceramics",
    description: "Four handmade cups and one teapot.",
    budget_amount: 6850,
    currency_code: "sgd",
    listing_type: "custom_request",
  })
})

test("rejects a request without a title", () => {
  assert.equal(typeof buildCustomOrderPayload, "function")

  const formData = new FormData()
  formData.set("artisan_id", "art_123")
  formData.set("title", " ")
  formData.set("product_category", "Ceramics")
  formData.set("description", "A detailed request")
  formData.set("currency_code", "sgd")

  assert.throws(
    () => buildCustomOrderPayload(formData),
    /Please enter a request title/
  )
})

test("rejects a negative budget", () => {
  assert.equal(typeof buildCustomOrderPayload, "function")

  const formData = new FormData()
  formData.set("artisan_id", "art_123")
  formData.set("title", "Ceramic tea set")
  formData.set("product_category", "Ceramics")
  formData.set("description", "A detailed request")
  formData.set("budget_amount", "-1")
  formData.set("currency_code", "sgd")

  assert.throws(
    () => buildCustomOrderPayload(formData),
    /Budget must be a valid non-negative amount/
  )
})

test("rejects a budget above the backend integer limit", () => {
  assert.equal(typeof buildCustomOrderPayload, "function")

  const formData = new FormData()
  formData.set("artisan_id", "art_123")
  formData.set("title", "Ceramic tea set")
  formData.set("product_category", "Ceramics")
  formData.set("description", "A detailed request")
  formData.set("budget_amount", "21474836.48")
  formData.set("currency_code", "sgd")

  assert.throws(() => buildCustomOrderPayload(formData), /Budget is too large/)
})

test("marks the completed and current steps for an order in production", () => {
  assert.equal(typeof getCustomOrderTimeline, "function")

  assert.deepEqual(getCustomOrderTimeline("produced"), [
    { status: "request", label: "提交需求", state: "complete" },
    { status: "quote", label: "报价", state: "complete" },
    { status: "confirmed", label: "已确认", state: "complete" },
    { status: "produced", label: "已生产", state: "current" },
    { status: "delivered", label: "已交付", state: "upcoming" },
  ])
})

test("represents cancellation as a separate terminal state", () => {
  assert.equal(typeof getCustomOrderTimeline, "function")

  assert.deepEqual(getCustomOrderTimeline("cancelled"), [
    { status: "cancelled", label: "已取消", state: "current" },
  ])
})

test("frontend status set stays identical to the backend state machine", () => {
  const statusesMatch = backendStateMachineSource.match(
    /CUSTOM_ORDER_STATUSES = \[([\s\S]*?)\]/
  )
  assert.ok(statusesMatch, "CUSTOM_ORDER_STATUSES not found in the backend")
  const backendStatuses = Array.from(
    statusesMatch[1].matchAll(/"([a-z_]+)"/g)
  ).map((match) => match[1])

  assert.deepEqual(backendStatuses, [
    "request",
    "quote",
    "confirmed",
    "produced",
    "delivered",
    "cancelled",
  ])
})

test("the timeline renders exactly the backend flow order for every status", () => {
  const flow = ["request", "quote", "confirmed", "produced", "delivered"]

  for (const [index, status] of flow.entries()) {
    const timeline = getCustomOrderTimeline(status)
    assert.deepEqual(
      timeline.map((step) => step.status),
      flow
    )
    assert.equal(timeline[index].state, "current")
    assert.ok(
      timeline.slice(0, index).every((step) => step.state === "complete")
    )
    assert.ok(
      timeline.slice(index + 1).every((step) => step.state === "upcoming")
    )
  }

  assert.deepEqual(
    getCustomOrderTimeline("cancelled").map((step) => step.status),
    ["cancelled"]
  )
})

test("the request payload fields still match the backend POST contract", () => {
  const payload = buildCustomOrderPayload(
    (() => {
      const formData = new FormData()
      formData.set("artisan_id", "art_123")
      formData.set("title", "Ceramic tea set")
      formData.set("product_category", "Ceramics")
      formData.set("description", "Four handmade cups and one teapot.")
      formData.set("budget_amount", "68.50")
      formData.set("currency_code", "sgd")
      return formData
    })()
  )

  for (const field of Object.keys(payload)) {
    assert.ok(
      backendRouteSource.includes(field),
      `the backend POST /store/custom-orders route no longer reads "${field}"`
    )
  }
  assert.deepEqual(Object.keys(payload).sort(), [
    "artisan_id",
    "budget_amount",
    "currency_code",
    "description",
    "listing_type",
    "product_category",
    "title",
  ])
})
