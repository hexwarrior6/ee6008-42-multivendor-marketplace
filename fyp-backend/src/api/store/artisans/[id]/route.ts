import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  ARTISAN_PROFILE_MODULE,
  ArtisanProfileService,
} from "../../../../modules/artisan-profile"
import { toPublicArtisanProfile } from "../../../utils/artisan-profile"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const artisanProfileService: ArtisanProfileService = req.scope.resolve(
    ARTISAN_PROFILE_MODULE
  )
  const artisanProfile = await artisanProfileService.retrieveArtisanProfile(req.params.id)

  if (artisanProfile.verification_status !== "approved") {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Artisan profile not found")
  }

  res.json({ artisan_profile: toPublicArtisanProfile(artisanProfile) })
}
