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
const artisanPage = fs.readFileSync(
  path.join(root, "src/app/[countryCode]/(main)/artisans/[id]/page.tsx"),
  "utf8"
)
const artisanData = fs.readFileSync(
  path.join(root, "src/lib/data/artisans.ts"),
  "utf8"
)
const mediaFeed = fs.readFileSync(
  path.join(
    root,
    "src/modules/artisans/components/artisan-media-feed/index.tsx"
  ),
  "utf8"
)
const productPage = fs.readFileSync(
  path.join(root, "src/app/[countryCode]/(main)/products/[handle]/page.tsx"),
  "utf8"
)

const checks = [
  {
    name: "artisan data helper uses S1 store artisan APIs",
    ok:
      fs
        .readFileSync(path.join(root, "src/lib/data/artisans.ts"), "utf8")
        .includes("/store/artisans") &&
      fs
        .readFileSync(path.join(root, "src/lib/data/artisans.ts"), "utf8")
        .includes("artisan_profile") &&
      fs
        .readFileSync(path.join(root, "src/lib/data/artisans.ts"), "utf8")
        .includes("display_name") &&
      fs
        .readFileSync(path.join(root, "src/lib/data/artisans.ts"), "utf8")
        .includes("store_id"),
  },
  {
    name: "product detail links to artisan profile",
    ok:
      productTabs.includes("/artisans/") &&
      productTabs.includes("View artisan profile"),
  },
  {
    name: "product detail verifies an approved artisan profile before linking",
    ok:
      productPage.includes("retrieveArtisanProfileByStoreId") &&
      productTabs.includes("artisanProfileId &&") &&
      productTabs.includes("/artisans/${artisanProfileId}"),
  },
  {
    name: "product tabs receives countryCode",
    ok: productTabs.includes("countryCode"),
  },
  {
    name: "artisan products use the profile store id",
    ok: artisanPage.includes("storeId: artisan.store_id"),
  },
  {
    name: "profile failures are not masked by legacy sample content",
    ok:
      !artisanData.includes("retrieveLegacyStoreAsArtisanProfile") &&
      !artisanData.includes("fallbackArtisanMedia"),
  },
  {
    name: "behind-the-scenes videos use a video player",
    ok:
      mediaFeed.includes('item.type === "video"') &&
      mediaFeed.includes("<video"),
  },
]

const failures = [
  ...missingFiles.map((file) => `Missing file: ${file}`),
  ...checks
    .filter((check) => !check.ok)
    .map((check) => `Failed: ${check.name}`),
]

if (failures.length) {
  console.error("Artisan profile MVP check failed:")
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log("Artisan profile MVP check passed.")
