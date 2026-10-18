const assert = require("node:assert/strict")
const { createRequire } = require("node:module")

const nextRequire = createRequire(require.resolve("next/package.json"))
nextRequire("@next/env").loadEnvConfig(process.cwd())

const backend = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
const key = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
const country = process.env.RECOMMENDATION_TEST_COUNTRY || "cn"

async function get(path, headers = {}) {
  const response = await fetch(new URL(path, backend), {
    headers: { "x-publishable-api-key": key, ...headers },
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(response.status, 200, `${path.split("?")[0]} must return 200`)
  return { response, body: await response.json() }
}

async function checkRecommendations(productId, regionId) {
  const query = new URLSearchParams({ limit: "4" })
  if (productId) query.set("product_id", productId)
  const { response, body } = await get(`/store/recommendations?${query}`)
  assert.match(response.headers.get("cache-control") || "", /private.*no-store/)
  assert.ok(Array.isArray(body.recommendations))
  assert.equal(body.count, body.recommendations.length)
  assert.ok(body.count <= 4)
  assert.ok(body.count > 0, "Use a sales channel with at least two published products")
  assert.notEqual(body.source, "model_pending")
  const ids = body.recommendations.map((item) => item.product_id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(!ids.includes(productId))
  const productQuery = new URLSearchParams({
    limit: String(ids.length),
    region_id: regionId,
    fields: "id,title,handle,thumbnail,*images,*variants.calculated_price",
  })
  ids.forEach((id) => productQuery.append("id[]", id))
  const { body: catalog } = await get(`/store/products?${productQuery}`)
  for (const id of ids) {
    const product = catalog.products.find((item) => item.id === id)
    assert.ok(product?.handle, "Recommended products must have a current Store API route")
    assert.ok(product.variants?.length, "Recommended products must have variants")
    assert.ok(product.variants.some((variant) =>
      Number.isFinite(variant.calculated_price?.calculated_amount)
    ), "Recommended products need a price in the selected region")
  }
  return { source: body.source, strategy: body.strategy, count: body.count,
    fallback_reason: body.fallback_reason }
}

async function main() {
  assert.ok(key, "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY is required")
  const { body: regions } = await get("/store/regions")
  const region = regions.regions.find((item) =>
    item.countries?.some((entry) => entry.iso_2 === country)
  )
  assert.ok(region, `No region configured for ${country}`)
  const { body: catalog } = await get("/store/products?limit=1&fields=id,handle")
  assert.ok(catalog.products[0], "A published product is required")
  const home = await checkRecommendations(undefined, region.id)
  const product = await checkRecommendations(catalog.products[0].id, region.id)
  const denied = await fetch(new URL("/store/recommendations?customer_id=cus_other&limit=4", backend), {
    headers: { "x-publishable-api-key": key }, signal: AbortSignal.timeout(15000),
  })
  assert.equal(denied.status, 400, "Medusa must reject a caller-supplied customer identity")
  assert.equal((await denied.json()).type, "not_allowed")
  console.log(JSON.stringify({ country, home, product, identityGuard: "passed" }, null, 2))
  console.log("Read-only recommendation HTTP checks passed; no customer or order was created.")
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
