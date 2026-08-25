import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ARTISAN_PROFILE_MODULE,
  ArtisanProfileService,
} from "../../../modules/artisan-profile"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const artisanProfileService: ArtisanProfileService = req.scope.resolve(
    ARTISAN_PROFILE_MODULE
  )
  const { limit = 20, offset = 0, location } = req.query
  const [profiles, count] = await artisanProfileService.listAndCountArtisanProfiles(
    {
      verification_status: "approved",
      ...(location ? { location: String(location) } : {}),
    },
    {
      take: Math.min(Number(limit) || 20, 100),
      skip: Number(offset) || 0,
    }
  )

  res.json({ artisan_profiles: profiles, count, limit: Number(limit), offset: Number(offset) })
}
