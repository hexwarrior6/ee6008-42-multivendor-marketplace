const assert = require("node:assert/strict")
const { load } = require("./test-cart-currency.cjs")
const { getLineItemPrices } = load("src/lib/util/line-item-prices.ts")
const { getCountryOptions } = load("src/lib/util/country-options.ts")
const { getShippingAmount, isShippingUnavailable, resolveShippingPrices } = load("src/lib/util/shipping-prices.ts")

async function main() {
  let count = 0
  const test = async (name, fn) => { await fn(); count++; console.log(`PASS ${name}`) }
  const item = { unit_price: 10, quantity: 2 }
  const flat = { id: "flat", price_type: "flat", amount: 10 }
  const calculated = { id: "calculated", price_type: "calculated" }

  await test("missing totals use unit price and quantity", () => {
    const result = getLineItemPrices(item)
    assert.equal(result.currentPrice, 20)
    assert.equal(result.unitPrice, 10)
    assert.equal(result.hasReducedPrice, false)
  })
  await test("free items preserve zero total", () => {
    const result = getLineItemPrices({ ...item, total: 0, original_total: 20 })
    assert.equal(result.currentPrice, 0)
    assert.equal(result.percentageDiff, 100)
  })
  await test("discount and per-unit prices stay consistent", () => {
    const result = getLineItemPrices({ ...item, total: 15, original_total: 20 })
    assert.equal(result.unitPrice, 7.5)
    assert.equal(result.originalUnitPrice, 10)
    assert.equal(result.percentageDiff, 25)
  })
  await test("zero original totals do not divide by zero", () => {
    const result = getLineItemPrices({ ...item, total: 0, original_total: 0 })
    assert.equal(result.percentageDiff, 0)
    assert.equal(result.hasReducedPrice, false)
  })
  await test("zero quantity does not produce infinite unit prices", () => {
    const result = getLineItemPrices({ ...item, quantity: 0 })
    assert.equal(result.unitPrice, 10)
    assert.equal(result.currentPrice, 0)
  })
  await test("non-finite amounts cannot reach rendering", () => {
    const result = getLineItemPrices({ unit_price: NaN, quantity: Infinity, total: NaN, original_total: Infinity })
    for (const value of Object.values(result)) if (typeof value === "number") assert.ok(Number.isFinite(value))
  })
  await test("price components render missing totals without NaN", () => {
    const React = require("react")
    const { renderToStaticMarkup } = require("react-dom/server")
    for (const component of ["line-item-price", "line-item-unit-price"]) {
      const Component = load(`src/modules/common/components/${component}/index.tsx`, {
        "react/jsx-runtime": require("react/jsx-runtime"),
        "@lib/util/line-item-prices": { getLineItemPrices },
        "@lib/util/money": { convertToLocale: ({ amount }) => String(amount) },
        "@medusajs/ui": { clx: () => "" },
      }).default
      const html = renderToStaticMarkup(React.createElement(Component, { item, currencyCode: "cny" }))
      assert.doesNotMatch(html, /NaN|Infinity|undefined/)
      assert.match(html, component === "line-item-price" ? />20</ : />10</)
    }
  })
  await test("country options skip missing codes and missing country lists", () => {
    assert.deepEqual(getCountryOptions([{ id: "empty" }, { id: "r", countries: [{}] }]), [])
  })
  await test("country options normalize codes and provide fallback labels", () => {
    assert.deepEqual(getCountryOptions([{ id: "r", countries: [{ iso_2: " CN " }, { iso_2: "us", name: "USA" }] }]), [
      { country: "cn", region: "r", label: "CN" }, { country: "us", region: "r", label: "USA" },
    ])
  })
  await test("zero calculated shipping is displayed and selectable", () => {
    assert.equal(getShippingAmount(calculated, { calculated: 0 }), 0)
    assert.equal(isShippingUnavailable(calculated, { calculated: 0 }, false), false)
  })
  await test("zero flat shipping is displayed and selectable", () => {
    const free = { ...flat, amount: 0 }
    assert.equal(getShippingAmount(free, {}), 0)
    assert.equal(isShippingUnavailable(free, {}, false), false)
  })
  await test("missing, negative, and non-finite shipping amounts are blocked", () => {
    for (const amount of [undefined, null, NaN, Infinity, -1]) {
      assert.equal(isShippingUnavailable({ ...flat, amount }, {}, false), true)
    }
  })
  await test("loading calculated shipping cannot be selected", () => {
    assert.equal(isShippingUnavailable(calculated, { calculated: 10 }, true), true)
    assert.equal(isShippingUnavailable(flat, {}, true), false)
  })
  await test("insufficient stock blocks flat and calculated delivery", () => {
    assert.equal(isShippingUnavailable({ ...flat, insufficient_inventory: true }, {}, false), true)
    assert.equal(isShippingUnavailable({ ...calculated, insufficient_inventory: true }, { calculated: 0 }, false), true)
  })
  await test("price loading completes when there are no calculated options", async () => {
    assert.deepEqual(await resolveShippingPrices([flat], "cart", async () => { throw Error("Should not run") }), {})
  })
  await test("one failed calculation does not hide successful free shipping", async () => {
    const options = [calculated, { ...calculated, id: "failed" }, { ...calculated, id: "missing" }]
    const prices = await resolveShippingPrices(options, "cart", async (id, cartId) => {
      assert.equal(cartId, "cart")
      if (id === "failed") throw Error("Provider unavailable")
      return id === "missing" ? null : { amount: 0 }
    })
    assert.deepEqual(prices, { calculated: 0 })
  })
  await test("delete API receives authentication in the headers argument", async () => {
    let received
    const actions = load("src/lib/data/cart.ts", {
      "@lib/config": { sdk: { store: { cart: { deleteLineItem: async (...args) => { received = args } } } } },
      "@lib/util/medusa-error": { default: error => { throw error } },
      "@lib/util/cart-region": {}, "./regions": {},
      "./cookies": { getCartId: async () => "cart_test", getAuthHeaders: async () => ({ authorization: "Bearer test" }), getCacheTag: async name => name },
      "next/cache": { revalidateTag: () => {} }, "next/navigation": {},
    })
    await actions.deleteLineItem("item_test")
    assert.deepEqual(received, ["cart_test", "item_test", {}, { authorization: "Bearer test" }])
  })
  console.log(`${count} tests passed`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
