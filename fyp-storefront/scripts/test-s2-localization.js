const fs = require("fs")
const path = require("path")

const root = path.resolve(__dirname, "..")
const sourceRoot = path.join(root, "src")

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8")
}

function expectFile(relativePath) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    throw new Error(`Expected localization file: ${relativePath}`)
  }
}

function listSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      return listSourceFiles(fullPath)
    }

    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : []
  })
}

const temporaryChineseLiteralAllowlist = new Set([])

expectFile("src/lib/i18n/storefront.ts")
expectFile("src/lib/i18n/storefront-server.ts")
expectFile("src/lib/i18n/storefront-context.tsx")
expectFile("src/modules/layout/components/language-switcher/index.tsx")

const dictionary = read("src/lib/i18n/storefront.ts")
const normalizedDictionary = dictionary.replace(/\s+/g, " ")
const serverLocale = read("src/lib/i18n/storefront-server.ts")
const context = read("src/lib/i18n/storefront-context.tsx")
const constants = read("src/lib/constants.tsx")
const rootLayout = read("src/app/layout.tsx")
const switcher = read(
  "src/modules/layout/components/language-switcher/index.tsx"
)
const nav = read("src/modules/layout/templates/nav/index.tsx")
const footer = read("src/modules/layout/templates/footer/index.tsx")
const sideMenu = read("src/modules/layout/components/side-menu/index.tsx")
const hero = read("src/modules/home/components/hero/index.tsx")
const notFound = read("src/app/[countryCode]/(main)/not-found.tsx")
const accountNav = read("src/modules/account/components/account-nav/index.tsx")
const accountLogin = read("src/modules/account/components/login/index.tsx")
const accountRegister = read(
  "src/modules/account/components/register/index.tsx"
)
const accountOverview = read(
  "src/modules/account/components/overview/index.tsx"
)
const accountLayout = read("src/modules/account/templates/account-layout.tsx")
const storePage = read("src/app/[countryCode]/(main)/store/page.tsx")
const storeTemplate = read("src/modules/store/templates/index.tsx")
const sortProducts = read(
  "src/modules/store/components/refinement-list/sort-products/index.tsx"
)
const productActions = read(
  "src/modules/products/components/product-actions/index.tsx"
)
const mobileProductActions = read(
  "src/modules/products/components/product-actions/mobile-actions.tsx"
)
const productTabs = read(
  "src/modules/products/components/product-tabs/index.tsx"
)
const productReviews = read(
  "src/modules/products/components/product-reviews/product-review-section.tsx"
)
const relatedProducts = read(
  "src/modules/products/components/related-products/index.tsx"
)
const productPrice = read(
  "src/modules/products/components/product-price/index.tsx"
)
const emptyCart = read(
  "src/modules/cart/components/empty-cart-message/index.tsx"
)
const signInPrompt = read(
  "src/modules/cart/components/sign-in-prompt/index.tsx"
)
const cartItems = read("src/modules/cart/templates/items.tsx")
const checkoutAddresses = read(
  "src/modules/checkout/components/addresses/index.tsx"
)
const billingAddress = read(
  "src/modules/checkout/components/billing_address/index.tsx"
)
const shippingAddress = read(
  "src/modules/checkout/components/shipping-address/index.tsx"
)
const shipping = read("src/modules/checkout/components/shipping/index.tsx")
const checkoutReview = read("src/modules/checkout/components/review/index.tsx")
const checkoutSummary = read(
  "src/modules/checkout/templates/checkout-summary/index.tsx"
)
const constantsSource = read("src/lib/constants.tsx")
const payment = read("src/modules/checkout/components/payment/index.tsx")
const paymentButton = read(
  "src/modules/checkout/components/payment-button/index.tsx"
)
const wechatQrCode = read(
  "src/modules/checkout/components/wechat-qr-code/index.tsx"
)
const artisanPage = read("src/app/[countryCode]/(main)/artisans/[id]/page.tsx")
const customOrderPage = read(
  "src/app/[countryCode]/(main)/custom-orders/new/page.tsx"
)
const orderConfirmedPage = read(
  "src/app/[countryCode]/(main)/order/[id]/confirmed/page.tsx"
)
const orderDetails = read(
  "src/modules/order/components/order-details/index.tsx"
)
const orderSummary = read(
  "src/modules/order/components/order-summary/index.tsx"
)
const paymentDetails = read(
  "src/modules/order/components/payment-details/index.tsx"
)
const shippingDetails = read(
  "src/modules/order/components/shipping-details/index.tsx"
)
const orderCompleted = read(
  "src/modules/order/templates/order-completed-template.tsx"
)
const orderReview = read(
  "src/modules/order/templates/order-review-template.tsx"
)

for (const expected of [
  "storefront_locale",
  "zh-CN",
  "匠人故事",
  "定制订单申请",
  "提交申请",
  "订单进度",
  "shell:",
  "account:",
  "catalog:",
  "cart:",
  "checkout:",
  "order:",
  "artisan:",
  "customOrder:",
  'brand: "Handmade Marketplace"',
  'brand: "手作市集"',
  'menu: "Menu"',
  'menu: "菜单"',
  'becomeSeller: "Become a seller"',
  'becomeSeller: "成为商家"',
  'notFoundTitle: "Page not found"',
  'notFoundTitle: "页面不存在"',
  'loginTitle: "Sign in"',
  'loginTitle: "登录"',
  'registerTitle: "Create your Handmade Marketplace account"',
  'registerTitle: "注册手作市集账户"',
  'addressesTitle: "Addresses"',
  'addressesTitle: "收货地址"',
  'recentOrders: "Recent orders"',
  'recentOrders: "最近订单"',
  'allProducts: "All products"',
  'allProducts: "全部商品"',
  'sortBy: "Sort by"',
  'sortBy: "排序方式"',
  'addToCart: "Add to cart"',
  'addToCart: "加入购物车"',
  'productInformation: "Product information"',
  'productInformation: "商品信息"',
  'viewArtisanProfile: "View artisan profile"',
  'viewArtisanProfile: "查看手艺人主页"',
  'productReviews: "Product reviews"',
  'productReviews: "商品评价"',
  'productReviewsIntro: "See what our customers are saying about this product"',
  'productReviewsIntro: "看看顾客对这件商品的评价"',
  'basedOnReviews: "Based on {count} reviews"',
  'basedOnReviews: "基于 {count} 条评价"',
  'relatedProducts: "Related products"',
  'relatedProducts: "相关商品"',
  'ratingNotRated: "Not rated"',
  'ratingNotRated: "暂无评分"',
  'priceFrom: "From"',
  'priceFrom: "起"',
  'originalPrice: "Original"',
  'originalPrice: "原价"',
  'emptyTitle: "Cart"',
  'emptyTitle: "购物车"',
  'checkoutFrom: "Checkout from"',
  'checkoutFrom: "结算商家："',
  'shippingAddress: "Shipping address"',
  'shippingAddress: "收货地址"',
  'continueToPayment: "Continue to payment"',
  'continueToPayment: "继续付款"',
  'reviewOrder: "Review order"',
  'reviewOrder: "确认订单"',
  'wechatPay: "WeChat Pay"',
  'wechatPay: "微信支付"',
  'wechatScanInstruction: "Scan the QR code with WeChat to complete payment, then continue to review your order."',
  'wechatScanInstruction: "请使用微信“扫一扫”完成支付，然后进入订单确认。"',
  'wechatMockHint: "Local mock mode is active. No real charge will be made."',
  'wechatMockHint: "当前是本地模拟模式，不会产生真实扣款。"',
  'confirmationTitle: "Thank you!"',
  'confirmationTitle: "感谢您的购买！"',
  'orderSummary: "Order summary"',
  'orderSummary: "订单摘要"',
  'shipping: "Shipping"',
  'shipping: "配送"',
  'reviews: "Product reviews"',
  'reviews: "商品评价"',
  'not_fulfilled: "Not fulfilled"',
  'not_fulfilled: "待履约"',
  'authorized: "Authorized"',
  'authorized: "已授权"',
]) {
  if (!normalizedDictionary.includes(expected.replace(/\s+/g, " "))) {
    throw new Error(`Missing localization value or feature group: ${expected}`)
  }
}

if (
  !orderDetails.includes("t.order.fulfillmentStatus") ||
  !orderDetails.includes("t.order.paymentStatusLabels")
) {
  throw new Error(
    "Order status values must map through the localized dictionary"
  )
}

for (const [name, source] of [
  ["order confirmation metadata", orderConfirmedPage],
  ["order details", orderDetails],
  ["order summary", orderSummary],
  ["payment details", paymentDetails],
  ["shipping details", shippingDetails],
  ["order completion", orderCompleted],
  ["order review", orderReview],
]) {
  if (
    !source.includes("getStorefrontDictionary") &&
    !source.includes("useStorefrontI18n")
  ) {
    throw new Error(`${name} must read order copy from the dictionary`)
  }
}

for (const [name, source] of [
  ["payment selection", payment],
  ["payment submission", paymentButton],
  ["WeChat QR code", wechatQrCode],
]) {
  if (!source.includes("useStorefrontI18n")) {
    throw new Error(`${name} must read payment copy from the dictionary`)
  }
}

if (!constantsSource.includes('providerId === "pp_wechat_wechat"')) {
  throw new Error("WeChat Pay provider id must remain unchanged")
}

for (const source of [payment, paymentButton]) {
  if (!source.includes("isWeChatPay")) {
    throw new Error("Payment flows must retain WeChat provider detection")
  }
}

for (const forbidden of ["mchid", "merchant_id", "private_key", "api_v3_key"]) {
  if (
    [payment, paymentButton, wechatQrCode].some((source) =>
      source.includes(forbidden)
    )
  ) {
    throw new Error(
      `Storefront payment UI must not expose merchant config: ${forbidden}`
    )
  }
}

for (const [name, source] of [
  ["empty cart", emptyCart],
  ["cart sign-in prompt", signInPrompt],
  ["cart items", cartItems],
  ["checkout addresses", checkoutAddresses],
  ["billing address", billingAddress],
  ["shipping address", shippingAddress],
  ["shipping method", shipping],
  ["checkout review", checkoutReview],
  ["checkout summary", checkoutSummary],
]) {
  if (
    !source.includes("getStorefrontDictionary") &&
    !source.includes("useStorefrontI18n")
  ) {
    throw new Error(
      `${name} must read cart or checkout copy from the dictionary`
    )
  }
}

for (const [name, source] of [
  ["store page", storePage],
  ["store template", storeTemplate],
  ["product sorting", sortProducts],
  ["product actions", productActions],
  ["mobile product actions", mobileProductActions],
  ["product tabs", productTabs],
  ["product reviews", productReviews],
  ["related products", relatedProducts],
  ["product price", productPrice],
]) {
  if (
    !source.includes("getStorefrontDictionary") &&
    !source.includes("useStorefrontI18n")
  ) {
    throw new Error(`${name} must read catalog copy from the dictionary`)
  }
}

if (!productReviews.includes("invisibleLabel")) {
  throw new Error("Product review ratings must expose localized labels")
}

for (const [name, source] of [
  ["account navigation", accountNav],
  ["login form", accountLogin],
  ["registration form", accountRegister],
  ["account overview", accountOverview],
  ["account layout", accountLayout],
]) {
  if (
    !source.includes("getStorefrontDictionary") &&
    !source.includes("useStorefrontI18n")
  ) {
    throw new Error(`${name} must read account copy from the dictionary`)
  }
}

if (!dictionary.includes("export type StorefrontDictionary")) {
  throw new Error("The storefront dictionary must export its inferred type")
}

if (!constants.includes("STOREFRONT_LANGUAGE_SWITCH_ENABLED = true")) {
  throw new Error("The language switch must be enabled after migration")
}

if (!serverLocale.includes("STOREFRONT_LANGUAGE_SWITCH_ENABLED")) {
  throw new Error("Server locale resolution must honor the rollout constant")
}

if (!serverLocale.includes('return "zh-CN"')) {
  throw new Error(
    "The disabled rollout must force the effective locale to zh-CN"
  )
}

if (
  !serverLocale.includes(
    'return isStorefrontLocale(selectedLocale) ? selectedLocale : "zh-CN"'
  )
) {
  throw new Error(
    "The invalid-cookie fallback must resolve to the default Chinese storefront"
  )
}

for (const expected of [
  "StorefrontLocaleProvider",
  "useStorefrontI18n",
  "createContext",
]) {
  if (!context.includes(expected)) {
    throw new Error(`Missing client localization context behavior: ${expected}`)
  }
}

if (!rootLayout.includes("<StorefrontLocaleProvider locale={locale}>")) {
  throw new Error("Root layout must mount the storefront locale provider")
}

if (!rootLayout.includes("<html lang={locale}")) {
  throw new Error("Root layout must expose the effective locale in html[lang]")
}

if (
  !switcher.includes("router.refresh()") ||
  !switcher.includes("aria-pressed")
) {
  throw new Error(
    "Language switcher must refresh and expose its selected state"
  )
}

if (!nav.includes("STOREFRONT_LANGUAGE_SWITCH_ENABLED")) {
  throw new Error("Navigation must gate the language switcher during migration")
}

if (!nav.includes("<LanguageSwitcher")) {
  throw new Error("Navigation must render the language switcher")
}

for (const [name, source, expectedAccess] of [
  ["navigation", nav, "getStorefrontDictionary"],
  ["footer", footer, "getStorefrontDictionary"],
  ["side menu", sideMenu, "useStorefrontI18n"],
  ["hero", hero, "getStorefrontDictionary"],
  ["not-found page", notFound, "getStorefrontDictionary"],
]) {
  if (!source.includes(expectedAccess)) {
    throw new Error(`${name} must read shared shell copy from the dictionary`)
  }
}

if (!artisanPage.includes("getStorefrontLocale")) {
  throw new Error("Artisan profile must resolve the selected locale")
}

if (!customOrderPage.includes("getStorefrontLocale")) {
  throw new Error("Custom order request must resolve the selected locale")
}

const unexpectedChineseFiles = listSourceFiles(sourceRoot)
  .map((file) => path.relative(root, file).replaceAll("\\", "/"))
  .filter((relativePath) => relativePath !== "src/lib/i18n/storefront.ts")
  .filter((relativePath) => /[\u3400-\u9fff]/u.test(read(relativePath)))
  .filter((relativePath) => !temporaryChineseLiteralAllowlist.has(relativePath))

if (unexpectedChineseFiles.length) {
  throw new Error(
    `Chinese UI literals found outside the dictionary and migration allowlist:\n${unexpectedChineseFiles.join(
      "\n"
    )}`
  )
}

// ---------------------------------------------------------------------------
// S5 localization regression checks
// ---------------------------------------------------------------------------

const typescript = require("typescript")

function collectDictionaryEntries(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const entryPath = prefix ? `${prefix}.${key}` : key
    return child && typeof child === "object"
      ? collectDictionaryEntries(child, entryPath)
      : [[entryPath, child]]
  })
}

const transpiledDictionary = typescript.transpileModule(
  fs.readFileSync(path.join(root, "src/lib/i18n/storefront.ts"), "utf8"),
  {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2019,
    },
  }
).outputText

const dictionaryModule = { exports: {} }
new Function("module", "exports", transpiledDictionary)(
  dictionaryModule,
  dictionaryModule.exports
)
const { storefrontDictionaries } = dictionaryModule.exports

const enEntries = collectDictionaryEntries(storefrontDictionaries.en)
const zhEntries = collectDictionaryEntries(storefrontDictionaries["zh-CN"])
const enEntryMap = new Map(enEntries)
const zhEntryMap = new Map(zhEntries)

const missingInZh = enEntries
  .map(([entryPath]) => entryPath)
  .filter((entryPath) => !zhEntryMap.has(entryPath))
const missingInEn = zhEntries
  .map(([entryPath]) => entryPath)
  .filter((entryPath) => !enEntryMap.has(entryPath))

if (missingInZh.length || missingInEn.length) {
  throw new Error(
    `Dictionary key parity failed. Missing in zh-CN: ${missingInZh.join(
      ", "
    ) || "none"}. Missing in en: ${missingInEn.join(", ") || "none"}.`
  )
}

const placeholderMismatch = enEntries.filter(([entryPath, enValue]) => {
  if (typeof enValue !== "string") {
    return false
  }
  const placeholders = enValue.match(/\{[a-zA-Z]+\}/g) ?? []
  const zhValue = zhEntryMap.get(entryPath)
  return placeholders.some(
    (placeholder) => !String(zhValue).includes(placeholder)
  )
})

if (placeholderMismatch.length) {
  throw new Error(
    `zh-CN values are missing interpolation placeholders: ${placeholderMismatch
      .map(([entryPath]) => entryPath)
      .join(", ")}`
  )
}

const s5LocalizedComponents = [
  ["nav cart dropdown", "src/modules/layout/components/cart-dropdown/index.tsx"],
  [
    "cart mismatch banner",
    "src/modules/layout/components/cart-mismatch-banner/index.tsx",
  ],
  ["cart totals", "src/modules/common/components/cart-totals/index.tsx"],
  ["cart page template", "src/modules/cart/templates/multivendor-cart.tsx"],
  ["cart page metadata", "src/app/[countryCode]/(main)/cart/page.tsx"],
  ["checkout header", "src/app/[countryCode]/(checkout)/layout.tsx"],
  ["discount code", "src/modules/checkout/components/discount-code/index.tsx"],
  ["address select", "src/modules/checkout/components/address-select/index.tsx"],
  ["checkout country select", "src/modules/checkout/components/country-select/index.tsx"],
  ["account orders page", "src/app/[countryCode]/(main)/account/@dashboard/orders/page.tsx"],
  ["account order overview", "src/modules/account/components/order-overview/index.tsx"],
  ["account order card", "src/modules/account/components/order-card/index.tsx"],
  ["account profile page", "src/app/[countryCode]/(main)/account/@dashboard/profile/page.tsx"],
  ["account info", "src/modules/account/components/account-info/index.tsx"],
  ["profile name widget", "src/modules/account/components/profile-name/index.tsx"],
  ["profile email widget", "src/modules/account/components/profile-email/index.tsx"],
  ["profile phone widget", "src/modules/account/components/profile-phone/index.tsx"],
  ["profile password widget", "src/modules/account/components/profile-password/index.tsx"],
  ["profile billing address", "src/modules/account/components/profile-billing-address/index.tsx"],
  ["add address form", "src/modules/account/components/address-card/add-address.tsx"],
  ["edit address form", "src/modules/account/components/address-card/edit-address-modal.tsx"],
  ["product review form", "src/modules/products/components/product-reviews/form.tsx"],
  ["order transfer page", "src/app/[countryCode]/(main)/order/[id]/transfer/[token]/page.tsx"],
  ["order transfer accept page", "src/app/[countryCode]/(main)/order/[id]/transfer/[token]/accept/page.tsx"],
  ["order transfer decline page", "src/app/[countryCode]/(main)/order/[id]/transfer/[token]/decline/page.tsx"],
  ["order transfer actions", "src/modules/order/components/transfer-actions/index.tsx"],
  ["home page metadata", "src/app/[countryCode]/(main)/page.tsx"],
  ["product page metadata", "src/app/[countryCode]/(main)/products/[handle]/page.tsx"],
  ["footer medusa cta", "src/modules/layout/components/medusa-cta/index.tsx"],
  ["side menu country select", "src/modules/layout/components/country-select/index.tsx"],
  ["custom orders dashboard page", "src/app/[countryCode]/(main)/account/@dashboard/custom-orders/page.tsx"],
  ["custom order card", "src/modules/custom-orders/components/custom-order-card/index.tsx"],
  ["custom order detail template", "src/modules/custom-orders/templates/detail-template.tsx"],
  ["cart line item", "src/modules/cart/components/item/index.tsx"],
  ["order details template", "src/modules/order/templates/order-details-template.tsx"],
  ["order completed template", "src/modules/order/templates/order-completed-template.tsx"],
  ["checkout page metadata", "src/app/[countryCode]/(checkout)/checkout/[id]/page.tsx"],
]

for (const [name, relativePath] of s5LocalizedComponents) {
  const source = read(relativePath)
  if (
    !source.includes("useStorefrontI18n") &&
    !source.includes("getStorefrontDictionary")
  ) {
    throw new Error(`S5 regression: ${name} must read copy from the dictionary`)
  }
}

const s5ResidueChecks = [
  ["nav cart dropdown", "src/modules/layout/components/cart-dropdown/index.tsx", [
    "Your shopping cart is empty.",
    "Start shopping",
    "Go to cart",
    "(excl. taxes)",
  ]],
  ["cart mismatch banner", "src/modules/layout/components/cart-mismatch-banner/index.tsx", [
    "Run transfer again",
    "Transferring..",
    "Something went wrong when we tried to transfer your cart",
  ]],
  ["cart totals", "src/modules/common/components/cart-totals/index.tsx", [
    "Subtotal (excl. shipping and taxes)",
  ]],
  ["checkout header", "src/app/[countryCode]/(checkout)/layout.tsx", [
    "Back to shopping cart",
    "Medusa Store",
  ]],
  ["discount code", "src/modules/checkout/components/discount-code/index.tsx", [
    "Add Promotion Code(s)",
    "Promotion(s) applied:",
  ]],
  ["address select", "src/modules/checkout/components/address-select/index.tsx", [
    "Choose an address",
  ]],
  ["account orders page", "src/app/[countryCode]/(main)/account/@dashboard/orders/page.tsx", [
    "View your previous orders",
  ]],
  ["account order overview", "src/modules/account/components/order-overview/index.tsx", [
    "Nothing to see here",
    "Continue shopping",
  ]],
  ["account order card", "src/modules/account/components/order-card/index.tsx", [
    "See details",
    "toDateString",
  ]],
  ["account overview", "src/modules/account/components/overview/index.tsx", [
    "toDateString",
  ]],
  ["account profile page", "src/app/[countryCode]/(main)/account/@dashboard/profile/page.tsx", [
    "View and edit your Medusa Store profile",
  ]],
  ["account info", "src/modules/account/components/account-info/index.tsx", [
    "succesfully",
  ]],
  ["product review form", "src/modules/products/components/product-reviews/form.tsx", [
    "Add a review",
    "Submit Review",
    "Your review has been submitted.",
    "Share your thoughts about this product",
  ]],
  ["order transfer page", "src/app/[countryCode]/(main)/order/[id]/transfer/[token]/page.tsx", [
    "Transfer request for order",
    "no further action is required",
  ]],
  ["order transfer accept page", "src/app/[countryCode]/(main)/order/[id]/transfer/[token]/accept/page.tsx", [
    "transfered",
  ]],
  ["root not-found page", "src/app/not-found.tsx", ["Page not found"]],
  ["checkout not-found page", "src/app/[countryCode]/(checkout)/not-found.tsx", ["Page not found"]],
  ["cart not-found page", "src/app/[countryCode]/(main)/cart/not-found.tsx", ["Clear your cookies"]],
  ["footer medusa cta", "src/modules/layout/components/medusa-cta/index.tsx", ["Powered by"]],
  ["side menu country select", "src/modules/layout/components/country-select/index.tsx", ["Shipping to:"]],
  ["home page metadata", "src/app/[countryCode]/(main)/page.tsx", [
    "Medusa Next.js Starter Template",
  ]],
  ["checkout page metadata", "src/app/[countryCode]/(checkout)/checkout/[id]/page.tsx", [
    'title: "Checkout"',
  ]],
  ["cart line item", "src/modules/cart/components/item/index.tsx", [
    "Variant: ",
    'placeholder = "Select..."',
  ]],
  ["nav cart dropdown", "src/modules/layout/components/cart-dropdown/index.tsx", [
    "Variant: ",
  ]],
]

for (const [name, relativePath, forbiddenStrings] of s5ResidueChecks) {
  const source = read(relativePath)
  for (const forbidden of forbiddenStrings) {
    if (source.includes(forbidden)) {
      throw new Error(
        `S5 regression: ${name} still contains English copy "${forbidden}". Restore the dictionary lookup.`
      )
    }
  }
}

console.log("S5 localization regression checks passed")
console.log("S2 storefront localization checks passed")
