import { model } from "@medusajs/framework/utils"

export const ArtisanProfile = model.define("artisan_profile", {
  id: model.id({ prefix: "art" }).primaryKey(),
  store_id: model.text().unique(),
  display_name: model.text(),
  bio: model.text().nullable(),
  avatar_url: model.text().nullable(),
  location: model.text().nullable(),
  specialties: model.json().nullable(),
  verification_status: model
    .enum(["draft", "pending", "approved", "rejected"])
    .default("draft"),
})
