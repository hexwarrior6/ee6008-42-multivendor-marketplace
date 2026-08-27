import { model } from "@medusajs/framework/utils"

export const ArtisanProfile = model.define("artisan_profile", {
  id: model.id({ prefix: "art" }).primaryKey(),
  store_id: model.text().unique(),
  // Back-office seller users are linked explicitly when a profile is created.
  // Keeping this nullable preserves compatibility with profiles created before
  // seller accounts were introduced; store_id remains the fallback ownership
  // boundary for those records.
  artisan_user_id: model.text().nullable(),
  display_name: model.text(),
  bio: model.text().nullable(),
  inspiration: model.text().nullable(),
  creative_process: model.text().nullable(),
  avatar_url: model.text().nullable(),
  location: model.text().nullable(),
  specialties: model.json().nullable(),
  media: model.json().nullable(),
  // Media writes use this value for optimistic concurrency. Without a
  // version, two upload/delete requests can both read the same JSON array and
  // the later request can silently overwrite the earlier one.
  version: model.number().default(0),
  verification_status: model
    .enum(["draft", "pending", "approved", "rejected"])
    .default("draft"),
})
