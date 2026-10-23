import { defineLink } from "@medusajs/framework/utils"
import ArtisanProfileModule from "../modules/artisan-profile"
import CustomOrderModule from "../modules/custom-order"

/** Associates an order's artisan_id with a real artisan profile. */
export default defineLink(
  ArtisanProfileModule.linkable.artisanProfile,
  {
    linkable: CustomOrderModule.linkable.customOrderRequest,
    isList: true,
  }
)
