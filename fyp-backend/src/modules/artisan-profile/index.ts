import { Module } from "@medusajs/framework/utils"
import { ArtisanProfileService } from "./service"

export const ARTISAN_PROFILE_MODULE = "artisan_profile"
export { ArtisanProfileService }

export default Module(ARTISAN_PROFILE_MODULE, {
  service: ArtisanProfileService,
})
