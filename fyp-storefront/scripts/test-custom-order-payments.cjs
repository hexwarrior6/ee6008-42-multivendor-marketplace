const assert = require("node:assert/strict")
const { load } = require("./test-cart-currency.cjs")
const React = require("react")
const jsx = require("react/jsx-runtime")
const { renderToStaticMarkup } = require("react-dom/server")
const dictionaries = load("src/lib/i18n/storefront.ts")

function actions({ signedIn = true, failure } = {}) {
  const requests = [],
    invalidations = []
  return {
    requests,
    invalidations,
    actions: load("src/lib/data/custom-order-payments.ts", {
      "@lib/config": {
        sdk: {
          client: {
            fetch: async (path, options) => {
              requests.push({ path, options })
              if (failure && path.endsWith(failure))
                throw Error("provider secret must not leak")
              return path.endsWith("payment-status")
                ? { verification: "simulated", payment_status: "pending" }
                : { payment_session: { id: "payses-1", mode: "mock" } }
            },
          },
        },
      },
      "@lib/data/cookies": {
        getAuthHeaders: async () =>
          signedIn ? { authorization: "Bearer test" } : {},
      },
      "next/cache": { revalidatePath: (...args) => invalidations.push(args) },
    }),
  }
}
function render({
  locale = "zh-CN",
  verification,
  session,
  pending = false,
  canPrepare = true,
} = {}) {
  let stateIndex = 0
  const Payment = load(
    "src/modules/custom-orders/components/payment/index.tsx",
    {
      "react/jsx-runtime": jsx,
      react: {
        useState: (initial) => [
          stateIndex++ === 0 ? session ?? null : initial,
          () => {},
        ],
        useTransition: () => [pending, () => {}],
      },
      "next/navigation": { useRouter: () => ({ refresh() {} }) },
      "@medusajs/ui": {
        Button: ({ children, disabled, onClick }) =>
          React.createElement("button", { disabled, onClick }, children),
        Text: ({ children, ...props }) =>
          React.createElement("p", props, children),
      },
      "@lib/data/custom-order-payments": {},
      "@lib/i18n/storefront": dictionaries,
      "@modules/checkout/components/wechat-qr-code": {
        default: ({ value }) =>
          React.createElement("img", { src: value, alt: "test-qr" }),
      },
    }
  ).default
  return renderToStaticMarkup(
    React.createElement(Payment, {
      id: "cor-1",
      locale,
      verification,
      canPrepare,
    })
  )
}
async function main() {
  let count = 0
  const test = async (name, fn) => {
    await fn()
    count++
    console.log(`PASS ${name}`)
  }
  await test("anonymous users never prepare or query payments", async () => {
    const h = actions({ signedIn: false })
    assert.deepEqual(await h.actions.prepareCustomOrderPayment("cor-1"), {
      success: false,
    })
    assert.deepEqual(await h.actions.refreshCustomOrderPayment("cor-1"), {
      success: false,
    })
    assert.equal(h.requests.length, 0)
  })
  await test("checks availability before binding then initializes with no client payment fields", async () => {
    const h = actions()
    assert.equal(
      (await h.actions.prepareCustomOrderPayment("cor/1")).success,
      true
    )
    assert.deepEqual(
      h.requests.map((r) => [r.path, r.options.method]),
      [
        ["/store/custom-orders/cor%2F1/payment-session", "GET"],
        ["/store/custom-orders/cor%2F1/payment-collection", "POST"],
        ["/store/custom-orders/cor%2F1/payment-session", "POST"],
      ]
    )
    assert.ok(
      h.requests.every(
        (r) => r.options.cache === "no-store" && r.options.headers.authorization
      )
    )
    assert.deepEqual(h.requests[1].options.body, {})
    assert.deepEqual(h.requests[2].options.body, {})
  })
  await test("unavailable providers never cause a collection binding", async () => {
    const h = actions({ failure: "payment-session" })
    assert.deepEqual(await h.actions.prepareCustomOrderPayment("cor-1"), {
      success: false,
    })
    assert.equal(h.requests.length, 1)
  })
  await test("status refresh is authenticated POST with an empty body and revalidation", async () => {
    const h = actions()
    assert.deepEqual(await h.actions.refreshCustomOrderPayment("cor/1"), {
      success: true,
      verification: "simulated",
      payment_status: "pending",
    })
    assert.equal(h.requests[0].options.method, "POST")
    assert.deepEqual(h.requests[0].options.body, {})
    assert.deepEqual(h.invalidations, [
      ["/[countryCode]/account/custom-orders", "layout"],
    ])
  })
  await test("provider errors return no sensitive message", async () => {
    const h = actions({ failure: "payment-status" })
    assert.deepEqual(await h.actions.refreshCustomOrderPayment("cor-1"), {
      success: false,
    })
  })
  for (const locale of ["zh-CN", "en"]) {
    const t = dictionaries.getStorefrontDictionary(locale).customOrder
    await test(`${locale}: simulated payments show warning and no payable QR`, () => {
      const html = render({
        locale,
        verification: "simulated",
        session: { mode: "mock", code_url: "weixin://fake" },
      })
      assert.ok(html.includes(t.customPaymentMock))
      assert.ok(!html.includes("<img"))
      assert.ok(!html.includes(t.customPaymentVerified))
    })
    await test(`${locale}: live sessions show QR and instructions`, () => {
      const html = render({
        locale,
        session: {
          mode: "live",
          code_url: "weixin://wxpay/bizpayurl/up?pr=TEST",
        },
      })
      assert.ok(html.includes(t.customPaymentScan))
      assert.ok(html.includes("<img"))
    })
    await test(`${locale}: review and verified states are distinct`, () => {
      assert.ok(
        render({ locale, verification: "review_required" }).includes(
          t.customPaymentReview
        )
      )
      const paid = render({
        locale,
        verification: "verified",
        canPrepare: false,
      })
      assert.ok(paid.includes(t.customPaymentVerified))
      assert.ok(!paid.includes(t.customPaymentStart))
    })
  }
  await test("pending work disables both buttons", () => {
    assert.equal(
      (render({ pending: true }).match(/disabled=""/g) ?? []).length,
      2
    )
  })
  console.log(`${count} tests passed`)
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
