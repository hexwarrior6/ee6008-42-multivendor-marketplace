const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")

function load(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const module = { exports: {} }
  new Function("require", "module", "exports", compiled)((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}

const regionUtil = load("src/lib/util/cart-region.ts")
const region = { id: "reg_test", currency_code: "cny" }
const oldCart = { id: "cart_test", region_id: region.id, currency_code: "usd", region }
const freshCart = { ...oldCart, currency_code: "cny" }

function harness(file, initial = oldCart, failure = false) {
  const calls = []
  const tags = []
  const sdk = {
    client: { fetch: async (url, options) => {
      calls.push({ url, options })
      return url.startsWith("/store/carts/") ? { cart: initial } : { store: { name: "Test" } }
    } },
    store: { cart: {
      update: async (...args) => {
        calls.push({ update: args })
        if (failure) throw new Error("Price unavailable")
        return { cart: freshCart }
      },
      create: async () => ({ cart: freshCart }),
    } },
  }
  const cookies = {
    getAuthHeaders: async () => ({}), getCacheOptions: async () => ({}),
    getCacheTag: async (name) => name, getCartId: async () => oldCart.id,
    getSellerCartMapping: async () => ({ seller_test: oldCart.id }),
    setSellerCartMapping: async () => {}, setCartId: async () => {}, removeCartId: async () => {},
  }
  return { calls, tags, actions: load(file, {
    "@lib/config": { sdk }, "@lib/util/medusa-error": { default: (e) => { throw e } },
    "@lib/util/cart-region": regionUtil, "./regions": { getRegion: async () => region },
    "./cookies": cookies, "next/cache": { revalidateTag: (tag) => tags.push(tag) },
    "next/navigation": { redirect: () => {} },
  }) }
}

async function main() {
  let count = 0
  const check = async (name, fn) => { await fn(); count++; console.log(`PASS ${name}`) }
  await check("same region with changed currency needs refresh", () => assert.equal(regionUtil.needsCartRegionUpdate(oldCart, region), true))
  await check("matching currencies do not need refresh", () => assert.equal(regionUtil.needsCartRegionUpdate(freshCart, region), false))
  await check("currency comparison is case insensitive", () => assert.equal(regionUtil.needsCartRegionUpdate({ ...freshCart, currency_code: "CNY" }, region), false))
  await check("different regions still need refresh", () => assert.equal(regionUtil.needsCartRegionUpdate({ ...freshCart, region_id: "other" }, region), true))
  for (const [file, method, args] of [
    ["src/lib/data/cart.ts", "getOrSetCart", ["cn"]],
    ["src/lib/data/seller-cart.ts", "getOrCreateSellerCart", ["seller_test", "cn"]],
  ]) {
    await check(`${method} returns repriced cart and invalidates cache`, async () => {
      const h = harness(file)
      assert.equal((await h.actions[method](...args)).currency_code, "cny")
      assert.deepEqual(h.calls.find(c => c.update).update[1], { region_id: region.id })
      assert.ok(h.tags.includes("carts"))
    })
    await check(`${method} leaves current carts unchanged`, async () => {
      const h = harness(file, freshCart)
      await h.actions[method](...args)
      assert.equal(h.calls.filter(c => c.update).length, 0)
    })
  }
  await check("explicit repair checks fresh data and invalidates delivery cache", async () => {
    const h = harness("src/lib/data/seller-cart.ts")
    await h.actions.synchronizeCartCurrency(oldCart.id)
    assert.equal(h.calls[0].options.cache, "no-store")
    assert.ok(h.tags.includes("fulfillment"))
    assert.ok(h.tags.includes("carts"))
  })
  await check("repair errors propagate instead of proceeding to payment", async () => {
    const h = harness("src/lib/data/seller-cart.ts", oldCart, true)
    await assert.rejects(h.actions.synchronizeCartCurrency(oldCart.id), /Price unavailable/)
  })
  await check("repair is a no-op for an already corrected cart", async () => {
    const h = harness("src/lib/data/seller-cart.ts", freshCart)
    await h.actions.synchronizeCartCurrency(freshCart.id)
    assert.equal(h.calls.filter(c => c.update).length, 0)
  })
  await check("checkout reads current amounts instead of stale cart cache", async () => {
    const h = harness("src/lib/data/seller-cart.ts", freshCart)
    await h.actions.retrieveCart(freshCart.id)
    assert.equal(h.calls[0].options.cache, "no-store")
  })
  console.log(`${count} tests passed`)
}

if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1 })
module.exports = { load }
