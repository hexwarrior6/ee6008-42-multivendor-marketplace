const assert = require("node:assert/strict")
const { load } = require("./test-cart-currency.cjs")
const React = require("react")
const jsx = require("react/jsx-runtime")
const { renderToStaticMarkup } = require("react-dom/server")
const sessionUtil = load("src/lib/util/payment-session.ts")

function cookiesFor(raw) {
  const writes = []
  const actions = load("src/lib/data/cookies.ts", {
    "server-only": {},
    "next/headers": { cookies: async () => ({
      get: () => raw === undefined ? undefined : { value: raw },
      set: (...args) => writes.push(args),
    }) },
  })
  return { actions, writes }
}

function regionSwitch({ legacy, mapping = {}, fail, region = { id: "reg_cn" } } = {}) {
  const updates = [], tags = [], redirects = []
  const actions = load("src/lib/data/cart.ts", {
    "@lib/config": { sdk: { store: { cart: { update: async (...args) => {
      updates.push(args)
      if (args[0] === fail) throw Error("Region update failed")
      return { cart: {} }
    } } } } },
    "@lib/util/medusa-error": { default: e => { throw e } },
    "@lib/util/cart-region": {}, "./regions": { getRegion: async () => region },
    "./cookies": {
      getCartId: async () => legacy, getSellerCartMapping: async () => mapping,
      getAuthHeaders: async () => ({ authorization: "Bearer diagnostic" }),
      getCacheTag: async name => name,
    },
    "next/cache": { revalidateTag: tag => tags.push(tag) },
    "next/navigation": { redirect: url => redirects.push(url) },
  })
  return { actions, updates, tags, redirects }
}

async function main() {
  let count = 0
  const test = async (name, fn) => { await fn(); count++; console.log(`PASS ${name}`) }

  await test("region lookup sees changed currency without a process restart", async () => {
    let current = { id: "reg_cn", currency_code: "usd", countries: [{ iso_2: "cn" }] }
    const requests = []
    const regions = load("src/lib/data/regions.ts", {
      "@lib/config": { sdk: { client: { fetch: async (url, options) => {
        requests.push(options); return { regions: current ? [current] : [] }
      } } } },
      "@lib/util/medusa-error": { default: e => { throw e } }, "./cookies": { getCacheOptions: async () => ({}) },
    })
    assert.equal((await regions.getRegion("CN")).currency_code, "usd")
    current = { ...current, currency_code: "cny" }
    assert.equal((await regions.getRegion(" cn ")).currency_code, "cny")
    current = null
    assert.equal(await regions.getRegion("cn"), null)
    assert.equal(requests.length, 3)
    assert.ok(requests.every(request => request.cache === "no-store"))
  })

  for (const raw of [undefined, "{", "null", "[]", "42", '"text"']) {
    await test(`invalid mapping cookie safely returns an empty mapping: ${raw}`, async () => {
      const h = cookiesFor(raw)
      assert.deepEqual(await h.actions.getSellerCartMapping(), {})
      assert.equal(h.writes.length, 0)
    })
  }
  await test("mapping keeps valid carts and rejects objects, paths, and prototype keys", async () => {
    const h = cookiesFor('{"store_ok":"cart_123","store_old":{"id":"cart_456"},"store_path":"../cart","__proto__":"cart_x"}')
    assert.deepEqual(await h.actions.getSellerCartMapping(), { store_ok: "cart_123" })
  })
  await test("mapping setter persists string IDs rather than cart DTO objects", async () => {
    const h = cookiesFor()
    await h.actions.setSellerCartMapping({ store_ok: "cart_123", store_bad: { id: "cart_bad" } })
    assert.deepEqual(JSON.parse(h.writes[0][1]), { store_ok: "cart_123" })
  })
  await test("seller-only carts all update before region navigation", async () => {
    const h = regionSwitch({ mapping: { store_a: "cart_a", store_b: "cart_b" } })
    await h.actions.updateRegion(" CN ", "/cart")
    assert.deepEqual(h.updates.map(args => args[0]).sort(), ["cart_a", "cart_b"])
    assert.ok(h.updates.every(args => args[1].region_id === "reg_cn" && args[3].authorization))
    assert.deepEqual(h.redirects, ["/cn/cart"])
    assert.ok(h.tags.includes("fulfillment"))
  })
  await test("legacy and seller mappings deduplicate the same cart", async () => {
    const h = regionSwitch({ legacy: "cart_a", mapping: { store_a: "cart_a", store_b: "cart_b" } })
    await h.actions.updateRegion("cn", "/cart")
    assert.equal(h.updates.length, 2)
  })
  await test("a failed update prevents success navigation and invalidates completed updates", async () => {
    const h = regionSwitch({ mapping: { store_a: "cart_a", store_b: "cart_b" }, fail: "cart_b" })
    await assert.rejects(h.actions.updateRegion("cn", "/cart"), /Region update failed/)
    assert.equal(h.redirects.length, 0)
    assert.equal(h.updates.length, 2)
    assert.ok(h.tags.includes("carts"))
  })
  await test("missing regions cannot change cart prices", async () => {
    const h = regionSwitch({ legacy: "cart_a", region: null })
    await assert.rejects(h.actions.updateRegion("xx", "/cart"), /Region not found/)
    assert.equal(h.updates.length, 0)
  })
  await test("empty cart mappings still permit navigation", async () => {
    const h = regionSwitch()
    await h.actions.updateRegion("cn", "/store")
    assert.deepEqual(h.redirects, ["/cn/store"])
  })

  const stripeReact = require("@stripe/react-stripe-js")
  const actualStripeWrapper = load("src/modules/checkout/components/payment-wrapper/stripe-wrapper.tsx", {
    "react/jsx-runtime": jsx, "react": React, "@stripe/react-stripe-js": stripeReact,
  })
  const constants = {
    isStripeLike: id => id?.startsWith("pp_stripe_") || id?.startsWith("pp_medusa-"),
    isManual: id => id?.startsWith("pp_system_default"),
    isWeChatPay: id => id === "pp_wechat_wechat",
  }
  let orders = 0
  const Empty = () => null
  const Button = props => React.createElement("button", { disabled: props.disabled }, props.children)
  const PaymentButton = load("src/modules/checkout/components/payment-button/index.tsx", {
    "react/jsx-runtime": jsx, "react": React,
    "@lib/constants": constants, "@lib/util/payment-session": sessionUtil,
    "../payment-wrapper/stripe-wrapper": actualStripeWrapper,
    "@lib/data/seller-cart": { placeOrder: async () => { orders++; throw Error("No orders allowed") } },
    "@lib/i18n/storefront-context": { useStorefrontI18n: () => ({ t: { checkout: {
      cardNotReady: "Card not ready", placeOrder: "Place order", selectPaymentMethod: "Select payment",
    } } }) },
    "@medusajs/ui": { Button }, "@stripe/react-stripe-js": stripeReact,
    "../error-message": { default: Empty },
    "next/navigation": { useParams: () => ({ countryCode: "cn" }), usePathname: () => "/cn/checkout/test", useRouter: () => ({}) },
  }).default
  // Only a null Stripe instance is used. No Stripe network or payment calls are made.
  function wrapper(configured) {
    const saved = [process.env.NEXT_PUBLIC_STRIPE_KEY, process.env.NEXT_PUBLIC_MEDUSA_PAYMENTS_PUBLISHABLE_KEY]
    delete process.env.NEXT_PUBLIC_STRIPE_KEY
    delete process.env.NEXT_PUBLIC_MEDUSA_PAYMENTS_PUBLISHABLE_KEY
    if (configured) process.env.NEXT_PUBLIC_STRIPE_KEY = "pk_test_diagnostic"
    try {
      return load("src/modules/checkout/components/payment-wrapper/index.tsx", {
        "react/jsx-runtime": jsx, "react": React,
        "@stripe/stripe-js": { loadStripe: () => null },
        "./stripe-wrapper": actualStripeWrapper, "@lib/constants": constants,
        "@lib/util/payment-session": sessionUtil,
      }).default
    } finally {
      for (const [index, key] of ["NEXT_PUBLIC_STRIPE_KEY", "NEXT_PUBLIC_MEDUSA_PAYMENTS_PUBLISHABLE_KEY"].entries()) {
        if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index]
      }
    }
  }
  // Use an inert resolved promise so the real Elements provider can be mounted during SSR.
  const savedKey = process.env.NEXT_PUBLIC_STRIPE_KEY
  process.env.NEXT_PUBLIC_STRIPE_KEY = "pk_test_diagnostic"
  const Wrapper = load("src/modules/checkout/components/payment-wrapper/index.tsx", {
    "react/jsx-runtime": jsx, "react": React,
    "@stripe/stripe-js": { loadStripe: () => Promise.resolve(null) },
    "./stripe-wrapper": actualStripeWrapper, "@lib/constants": constants,
    "@lib/util/payment-session": sessionUtil,
  }).default
  if (savedKey === undefined) delete process.env.NEXT_PUBLIC_STRIPE_KEY; else process.env.NEXT_PUBLIC_STRIPE_KEY = savedKey
  const cart = { id: "cart_test", shipping_address: {}, billing_address: {}, email: "test@example.com", shipping_methods: [{}] }
  for (const status of ["pending", "requires_more", "authorized"]) {
    await test(`Stripe ${status} renders with the real Elements context`, () => {
      const session = { id: "session_test", provider_id: "pp_stripe_stripe", status, data: { client_secret: "diagnostic" } }
      const state = { ...cart, payment_collection: { payment_sessions: [session] } }
      const html = renderToStaticMarkup(React.createElement(Wrapper, { cart: state }, React.createElement(PaymentButton, { cart: state })))
      assert.match(html, /Place order/)
      assert.doesNotMatch(html, /Card not ready/)
    })
  }
  await test("missing Stripe config renders a disabled message, not a context exception", () => {
    const MissingWrapper = wrapper(false)
    const state = { ...cart, payment_collection: { payment_sessions: [{ status: "authorized", provider_id: "pp_stripe_stripe" }] } }
    const html = renderToStaticMarkup(React.createElement(MissingWrapper, { cart: state }, React.createElement(PaymentButton, { cart: state })))
    assert.match(html, /disabled/)
    assert.match(html, /Card not ready/)
  })
  await test("canceled and failed sessions cannot be used to submit an order", () => {
    assert.equal(sessionUtil.getActivePaymentSession([{ status: "canceled" }, { status: "error" }]), undefined)
    const state = { ...cart, payment_collection: { payment_sessions: [{ status: "canceled", provider_id: "pp_wechat_wechat" }] } }
    assert.match(renderToStaticMarkup(React.createElement(PaymentButton, { cart: state })), /Select payment/)
    assert.equal(orders, 0)
  })
  console.log(`${count} tests passed`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
