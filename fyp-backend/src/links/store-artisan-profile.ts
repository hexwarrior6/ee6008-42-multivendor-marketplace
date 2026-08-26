import { defineLink } from "@medusajs/framework/utils"
import StoreModule from "@medusajs/medusa/store"
import ArtisanProfileModule from "../modules/artisan-profile"

/** Keeps the profile's store_id linkable through Medusa's query graph. */
export default defineLink(
  StoreModule.linkable.store,
  ArtisanProfileModule.linkable.artisanProfile
)
