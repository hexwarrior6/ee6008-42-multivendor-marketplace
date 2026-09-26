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

const temporaryChineseLiteralAllowlist = new Set([
  "src/app/[countryCode]/(main)/account/@dashboard/addresses/page.tsx",
  "src/app/[countryCode]/(main)/account/@dashboard/page.tsx",
  "src/app/[countryCode]/(main)/account/@login/page.tsx",
  "src/app/[countryCode]/(main)/custom-orders/new/page.tsx",
  "src/app/[countryCode]/(main)/not-found.tsx",
  "src/app/[countryCode]/(main)/order/[id]/confirmed/page.tsx",
  "src/app/[countryCode]/(main)/store/page.tsx",
  "src/lib/constants.tsx",
  "src/lib/util/custom-order-status.ts",
  "src/modules/account/components/account-nav/index.tsx",
  "src/modules/account/components/login/index.tsx",
  "src/modules/account/components/overview/index.tsx",
  "src/modules/account/components/register/index.tsx",
  "src/modules/cart/components/empty-cart-message/index.tsx",
  "src/modules/cart/components/sign-in-prompt/index.tsx",
  "src/modules/cart/templates/items.tsx",
  "src/modules/checkout/components/addresses/index.tsx",
  "src/modules/checkout/components/billing_address/index.tsx",
  "src/modules/checkout/components/payment-button/index.tsx",
  "src/modules/checkout/components/payment/index.tsx",
  "src/modules/checkout/components/review/index.tsx",
  "src/modules/checkout/components/shipping-address/index.tsx",
  "src/modules/checkout/components/shipping/index.tsx",
  "src/modules/checkout/components/wechat-qr-code/index.tsx",
  "src/modules/checkout/templates/checkout-summary/index.tsx",
  "src/modules/home/components/hero/index.tsx",
  "src/modules/layout/components/side-menu/index.tsx",
  "src/modules/layout/templates/footer/index.tsx",
  "src/modules/layout/templates/nav/index.tsx",
  "src/modules/order/components/order-details/index.tsx",
  "src/modules/order/components/order-summary/index.tsx",
  "src/modules/order/components/payment-details/index.tsx",
  "src/modules/order/components/shipping-details/index.tsx",
  "src/modules/order/templates/order-review-template.tsx",
  "src/modules/products/components/product-actions/index.tsx",
  "src/modules/products/components/product-actions/mobile-actions.tsx",
  "src/modules/products/components/product-tabs/index.tsx",
  "src/modules/store/components/refinement-list/sort-products/index.tsx",
  "src/modules/store/templates/index.tsx",
])

expectFile("src/lib/i18n/storefront.ts")
expectFile("src/lib/i18n/storefront-server.ts")
expectFile("src/lib/i18n/storefront-context.tsx")
expectFile("src/modules/layout/components/language-switcher/index.tsx")

const dictionary = read("src/lib/i18n/storefront.ts")
const serverLocale = read("src/lib/i18n/storefront-server.ts")
const context = read("src/lib/i18n/storefront-context.tsx")
const constants = read("src/lib/constants.tsx")
const rootLayout = read("src/app/layout.tsx")
const switcher = read("src/modules/layout/components/language-switcher/index.tsx")
const nav = read("src/modules/layout/templates/nav/index.tsx")
const artisanPage = read("src/app/[countryCode]/(main)/artisans/[id]/page.tsx")
const customOrderPage = read("src/app/[countryCode]/(main)/custom-orders/new/page.tsx")

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
  "checkout:",
  "order:",
  "artisan:",
  "customOrder:",
]) {
  if (!dictionary.includes(expected)) {
    throw new Error(`Missing localization value or feature group: ${expected}`)
  }
}

if (!dictionary.includes("export type StorefrontDictionary")) {
  throw new Error("The storefront dictionary must export its inferred type")
}

if (!constants.includes("STOREFRONT_LANGUAGE_SWITCH_ENABLED = false")) {
  throw new Error("The language switch must remain disabled during migration")
}

if (!serverLocale.includes("STOREFRONT_LANGUAGE_SWITCH_ENABLED")) {
  throw new Error("Server locale resolution must honor the rollout constant")
}

if (!serverLocale.includes('return "zh-CN"')) {
  throw new Error("The disabled rollout must force the effective locale to zh-CN")
}

if (!serverLocale.includes('return isStorefrontLocale(selectedLocale) ? selectedLocale : "en"')) {
  throw new Error("Enabled rollout must retain the invalid-cookie English fallback")
}

for (const expected of ["StorefrontLocaleProvider", "useStorefrontI18n", "createContext"]) {
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

if (!switcher.includes("router.refresh()") || !switcher.includes("aria-pressed")) {
  throw new Error("Language switcher must refresh and expose its selected state")
}

if (!nav.includes("STOREFRONT_LANGUAGE_SWITCH_ENABLED")) {
  throw new Error("Navigation must gate the language switcher during migration")
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
    `Chinese UI literals found outside the dictionary and migration allowlist:\n${unexpectedChineseFiles.join("\n")}`
  )
}

console.log("S2 storefront localization checks passed")
