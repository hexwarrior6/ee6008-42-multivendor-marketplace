const assert = require("node:assert/strict")
const { load } = require("./test-cart-currency.cjs")

const { sortProducts } = load("src/lib/util/sort-products.ts")

function product(id, day, price) {
  return {
    id,
    title: id,
    created_at: new Date(Date.UTC(2026, 0, day)).toISOString(),
    thumbnail: `${id}-old.jpg`,
    variants: [{ calculated_price: { calculated_amount: price } }],
  }
}

function harness(initial) {
  let catalog = initial
  const requests = []
  const cache = new Map()
  const region = { id: "reg_test" }
  const actions = load("src/lib/data/products.ts", {
    "@lib/config": { sdk: { client: { fetch: async (url, options) => {
      requests.push({ url, options })
      const key = JSON.stringify(options.query)
      if (options.cache !== "no-store" && cache.has(key)) return cache.get(key)
      const { limit, offset, order, id } = options.query
      let rows = structuredClone(catalog).filter(p => !id || id.includes(p.id))
      if (order) rows.sort((a, b) => order === "-created_at"
        ? Date.parse(b.created_at) - Date.parse(a.created_at)
        : Date.parse(a.created_at) - Date.parse(b.created_at))
      const result = { products: rows.slice(offset, offset + limit), count: rows.length }
      cache.set(key, result)
      return result
    } } } },
    "@lib/util/sort-products": { sortProducts },
    "./cookies": { getAuthHeaders: async () => ({}) },
    "./regions": { getRegion: async () => region, retrieveRegion: async () => region },
  })
  return { actions, requests, update: value => { catalog = value } }
}

async function main() {
  for (const sortBy of ["created_at", "price_asc", "price_desc"]) {
    const original = product("old", 1, 10)
    const h = harness([original])
    const read = () => h.actions.listProductsWithSort({ countryCode: "cn", sortBy, page: 1 })
    await read()
    h.update([{ ...original, thumbnail: "old-new.jpg" }, product("12121", 2, 20)])
    const { response } = await read()
    assert.equal(response.count, 2)
    assert.equal(response.products.find(p => p.id === "old").thumbnail, "old-new.jpg")
    assert.ok(response.products.some(p => p.id === "12121"))
    assert.deepEqual(response.products.map(p => p.id),
      sortBy === "price_asc" ? ["old", "12121"] : ["12121", "old"])
    assert.ok(h.requests.every(r => r.options.cache === "no-store"))
    console.log(`PASS ${sortBy}: creation and image edits remain visible after a prior visit`)
  }

  const h = harness(Array.from({ length: 125 }, (_, i) => product(`p${i}`, i + 1, i)))
  const first = await h.actions.listProductsWithSort({ countryCode: "cn", sortBy: "created_at" })
  assert.equal(first.response.products[0].id, "p124")
  assert.equal(first.response.products.length, 12)
  assert.equal(first.response.count, 125)
  assert.equal(first.nextPage, 2)
  const second = await h.actions.listProductsWithSort({ countryCode: "cn", sortBy: "created_at", page: 2 })
  assert.equal(second.response.products[0].id, "p112")
  assert.equal(second.nextPage, 3)
  assert.equal(h.requests[1].options.query.offset, 12)
  const last = await h.actions.listProductsWithSort({ countryCode: "cn", sortBy: "created_at", page: 11 })
  assert.equal(last.response.products.length, 5)
  assert.equal(last.nextPage, null)
  console.log("PASS latest arrivals: newest products beyond 100 items and API pagination")

  await h.actions.listProducts({ countryCode: "cn", queryParams: { id: ["p124"] } })
  h.update([{ ...product("p124", 125, 124), thumbnail: "detail-new.jpg" }])
  const detail = await h.actions.listProducts({ countryCode: "cn", queryParams: { id: ["p124"] } })
  assert.equal(detail.response.products[0].thumbnail, "detail-new.jpg")
  console.log("PASS detail requests: updated product data after a prior visit")
}

main().catch(error => { console.error(error); process.exitCode = 1 })
