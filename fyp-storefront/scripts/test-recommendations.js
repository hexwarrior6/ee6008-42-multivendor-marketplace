const assert = require("node:assert/strict")
const fs = require("node:fs")
const Module = require("node:module")
const path = require("node:path")
const test = require("node:test")
const ts = require("typescript")

function loadSource(relativePath, dependencies = {}) {
  const filename = path.resolve(__dirname, "..", relativePath)
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText
  const subject = new Module(filename, module)
  subject.filename = filename
  subject.paths = module.paths
  subject.require = (name) =>
    Object.hasOwn(dependencies, name) ? dependencies[name] : require(name)
  subject._compile(compiled, filename)
  return subject.exports
}

function setup({
  recommendations = [],
  products = [],
  authenticated = false,
  fail,
} = {}) {
  const calls = []
  const subject = loadSource("src/lib/data/recommendations.ts", {
    "server-only": {},
    "./cookies": {
      getAuthHeaders: async () =>
        authenticated ? { authorization: "Bearer test" } : {},
    },
    "@lib/config": {
      sdk: {
        client: {
          fetch: async (url, options) => {
            calls.push({ url, options })
            if (url === fail) throw new Error("Service unavailable")
            if (url === "/store/customers/me")
              return { customer: { id: "cus_test" } }
            if (url === "/store/recommendations") return { recommendations }
            if (url === "/store/products") return { products }
            throw new Error(`Unexpected URL: ${url}`)
          },
        },
      },
    },
  })
  return { ...subject, calls }
}

test("anonymous homepage requests fallback recommendations without a customer ID", async () => {
  const subject = setup()
  assert.deepEqual(
    await subject.listRecommendedProducts({ regionId: "reg_cn" }),
    []
  )
  assert.equal(subject.calls.length, 1)
  assert.deepEqual(subject.calls[0].options.query, { limit: 4 })
  assert.equal(subject.calls[0].options.cache, "no-store")
  assert.ok(subject.calls[0].options.signal instanceof AbortSignal)
})

test("authenticated product requests use the server-resolved customer and product IDs", async () => {
  const subject = setup({ authenticated: true })
  await subject.listRecommendedProducts({
    regionId: "reg_cn",
    productId: "prod_current",
  })
  assert.equal(subject.calls[1].url, "/store/recommendations")
  assert.deepEqual(subject.calls[1].options.query, {
    limit: 4,
    product_id: "prod_current",
    customer_id: "cus_test",
  })
})

test("expired login falls back to anonymous recommendations", async () => {
  const subject = setup({ authenticated: true, fail: "/store/customers/me" })
  await subject.listRecommendedProducts({ regionId: "reg_cn" })
  assert.deepEqual(subject.calls[1].options.query, { limit: 4 })
})

test("hydrates current regional product data in ranked order, excluding duplicates and the current product", async () => {
  const products = [
    { id: "b", handle: "b", title: "B" },
    { id: "a", handle: "a", title: "A" },
  ]
  const subject = setup({
    products,
    recommendations: [
      { product_id: "a", title: "Stale title", score: 0.9 },
      { product_id: "a", score: 0.8 },
      { product_id: "current", score: 0.7 },
      { product_id: "b", score: 0.6 },
      { product_id: "removed", score: 0.5 },
      null,
      {},
    ],
  })
  const result = await subject.listRecommendedProducts({
    regionId: "reg_cn",
    productId: "current",
  })
  assert.deepEqual(
    result.map((p) => p.id),
    ["a", "b"]
  )
  assert.equal(result[0].title, "A")
  assert.deepEqual(subject.calls[1].options.query.id, ["a", "b", "removed"])
  assert.equal(subject.calls[1].options.query.region_id, "reg_cn")
  assert.match(
    subject.calls[1].options.query.fields,
    /variants.calculated_price/
  )
  assert.equal(subject.calls[1].options.cache, "no-store")
})

test("filters unavailable products and products with no usable handle", async () => {
  const subject = setup({
    recommendations: [{ product_id: "a" }, { product_id: "b" }],
    products: [
      { id: "a", handle: null },
      { id: "b", handle: "" },
    ],
  })
  assert.deepEqual(
    await subject.listRecommendedProducts({ regionId: "reg_cn" }),
    []
  )
})

test("malformed response and model_pending produce no product lookup", async () => {
  for (const recommendations of [null, {}, [], [{ product_id: "" }]]) {
    const subject = setup({ recommendations })
    assert.deepEqual(
      await subject.listRecommendedProducts({ regionId: "reg_cn" }),
      []
    )
    assert.equal(subject.calls.length, 1)
  }
})

test("recommendation or product API failures degrade to an empty widget", async () => {
  for (const fail of ["/store/recommendations", "/store/products"]) {
    const subject = setup({ fail, recommendations: [{ product_id: "a" }] })
    assert.deepEqual(
      await subject.listRecommendedProducts({ regionId: "reg_cn" }),
      []
    )
  }
})

test("limits are bounded to the API contract", async () => {
  for (const [limit, expected] of [
    [100, 24],
    [0, 1],
    [-1, 1],
    [3.9, 3],
    [NaN, 4],
  ]) {
    const subject = setup()
    await subject.listRecommendedProducts({ regionId: "reg_cn", limit })
    assert.equal(subject.calls[0].options.query.limit, expected)
  }
})

test("legacy related products keep the public ID adapter after merging", async () => {
  const subject = setup({
    authenticated: true,
    recommendations: [
      null,
      {},
      { product_id: "" },
      { product_id: "current" },
      { product_id: "a" },
      { product_id: "a" },
      { product_id: "b" },
    ],
  })
  assert.deepEqual(await subject.listRecommendedProductIds("current"), [
    "a",
    "b",
  ])
  assert.equal(subject.calls.length, 1)
  assert.deepEqual(subject.calls[0].options.query, {
    product_id: "current",
    limit: 8,
  })
  assert.equal(subject.calls[0].options.headers, undefined)
  assert.equal(subject.calls[0].options.cache, "no-store")
  assert.ok(subject.calls[0].options.signal instanceof AbortSignal)
})

test("public ID adapter bounds results and safely handles invalid responses and failures", async () => {
  const subject = setup({
    recommendations: Array.from({ length: 20 }, (_, i) => ({
      product_id: `prod_${i}`,
    })),
  })
  assert.equal((await subject.listRecommendedProductIds("current")).length, 8)
  for (const recommendations of [null, {}, []]) {
    assert.deepEqual(
      await setup({ recommendations }).listRecommendedProductIds("current"),
      []
    )
  }
  assert.deepEqual(
    await setup({ fail: "/store/recommendations" }).listRecommendedProductIds(
      "current"
    ),
    []
  )
})

test("widget renders localized copy and product cards, and hides empty results", async () => {
  const React = require("react")
  const { renderToStaticMarkup } = require("react-dom/server")
  const { getStorefrontDictionary } = loadSource("src/lib/i18n/storefront.ts")
  for (const locale of ["en", "zh-CN"]) {
    const subject = loadSource(
      "src/modules/recommendations/components/product-recommendations/index.tsx",
      {
        "@lib/data/recommendations": {
          listRecommendedProducts: async () => [
            { id: "a", handle: "a", title: "Cup" },
          ],
        },
        "@lib/i18n/storefront": { getStorefrontDictionary },
        "@lib/i18n/storefront-server": {
          getStorefrontLocale: async () => locale,
        },
        "@modules/products/components/product-preview": {
          __esModule: true,
          default: ({ product }) =>
            React.createElement(
              "a",
              { href: `/products/${product.handle}` },
              product.title
            ),
        },
      }
    )
    const html = renderToStaticMarkup(
      await subject.default({ region: { id: "reg_cn" } })
    )
    assert.ok(html.includes(locale === "en" ? "You may also like" : "猜你喜欢"))
    assert.ok(html.includes("/products/a"))
  }
  const empty = loadSource(
    "src/modules/recommendations/components/product-recommendations/index.tsx",
    {
      "@lib/data/recommendations": { listRecommendedProducts: async () => [] },
      "@lib/i18n/storefront": { getStorefrontDictionary },
      "@lib/i18n/storefront-server": { getStorefrontLocale: async () => "en" },
      "@modules/products/components/product-preview": {},
    }
  )
  assert.equal(await empty.default({ region: { id: "reg_cn" } }), null)
})

test("product recommendations show the catalog fallback only when no recommendations are available", async () => {
  const React = require("react")
  const { renderToStaticMarkup } = require("react-dom/server")
  const { getStorefrontDictionary } = loadSource("src/lib/i18n/storefront.ts")
  const fallback = React.createElement("aside", null, "Catalog fallback")
  for (const products of [[], [{ id: "a", handle: "cup", title: "Cup" }]]) {
    const subject = loadSource(
      "src/modules/recommendations/components/product-recommendations/index.tsx",
      {
        "@lib/data/recommendations": { listRecommendedProducts: async () => products },
        "@lib/i18n/storefront": { getStorefrontDictionary },
        "@lib/i18n/storefront-server": { getStorefrontLocale: async () => "en" },
        "@modules/products/components/product-preview": {
          __esModule: true,
          default: ({ product }) => React.createElement("a", null, product.title),
        },
      }
    )
    const html = renderToStaticMarkup(
      await subject.default({ region: { id: "reg_cn" }, productId: "current", fallback })
    )
    assert.equal(html.includes("Catalog fallback"), products.length === 0)
    assert.equal(html.includes("You may also like"), products.length > 0)
  }
})

test("catalog fallback does not issue a second recommendation request", async () => {
  const queries = []
  const { getStorefrontDictionary } = loadSource("src/lib/i18n/storefront.ts")
  const subject = loadSource("src/modules/products/components/related-products/index.tsx", {
    "@lib/data/products": {
      listProducts: async (options) => {
        queries.push(options.queryParams)
        return { response: { products: [] } }
      },
    },
    "@lib/data/regions": { getRegion: async () => ({ id: "reg_cn" }) },
    "@lib/i18n/storefront": { getStorefrontDictionary },
    "@lib/i18n/storefront-server": { getStorefrontLocale: async () => "en" },
    "../product-preview": {},
    "@lib/data/recommendations": {
      listRecommendedProductIds: async () => {
        assert.fail("The catalog fallback must not request recommendations again")
      },
    },
  })
  assert.equal(await subject.default({
    product: { id: "current", collection_id: "collection_cups", tags: [{ id: "tag_ceramics" }] },
    countryCode: "cn",
  }), null)
  assert.deepEqual(queries, [{
    region_id: "reg_cn",
    collection_id: ["collection_cups"],
    tag_id: ["tag_ceramics"],
    is_giftcard: false,
  }])
})
