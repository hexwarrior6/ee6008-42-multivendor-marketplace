const fs = require("fs")
const path = require("path")

const root = path.resolve(__dirname, "..")

const requiredFiles = [
  "src/app/[countryCode]/(main)/artisans/[id]/page.tsx",
  "src/lib/data/artisans.ts",
  "src/modules/artisans/templates/index.tsx",
  "src/modules/artisans/components/artisan-hero/index.tsx",
  "src/modules/artisans/components/artisan-story/index.tsx",
  "src/modules/artisans/components/artisan-media-feed/index.tsx",
]

const missingFiles = requiredFiles.filter((file) => {
  return !fs.existsSync(path.join(root, file))
})

const productTabsPath = path.join(
  root,
  "src/modules/products/components/product-tabs/index.tsx"
)
const productTabs = fs.existsSync(productTabsPath)
  ? fs.readFileSync(productTabsPath, "utf8")
  : ""

const checks = [
  {
    name: "artisan data helper uses S1 store artisan APIs",
    ok:
      fs.readFileSync(path.join(root, "src/lib/data/artisans.ts"), "utf8")
        .includes("/store/artisans") &&
      fs.readFileSync(path.join(root, "src/lib/data/artisans.ts"), "utf8")
        .includes("artisan_profile") &&
      fs.readFileSync(path.join(root, "src/lib/data/artisans.ts"), "utf8")
        .includes("display_name") &&
      fs.readFileSync(path.join(root, "src/lib/data/artisans.ts"), "utf8")
        .includes("store_id"),
  },
  {
    name: "product detail links to artisan profile",
    ok:
      productTabs.includes("/artisans/") &&
      productTabs.includes("View artisan profile"),
  },
  {
    name: "product tabs receives countryCode",
    ok: productTabs.includes("countryCode"),
  },
]

const failures = [
  ...missingFiles.map((file) => `Missing file: ${file}`),
  ...checks.filter((check) => !check.ok).map((check) => `Failed: ${check.name}`),
]

if (failures.length) {
  console.error("Artisan profile MVP check failed:")
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log("Artisan profile MVP check passed.")
