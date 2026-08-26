import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ARTISAN_PROFILE_MODULE,
  ArtisanProfileService,
} from "../../../modules/artisan-profile"
import { normalizePagination } from "../../utils/validation"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const artisanProfileService: ArtisanProfileService = req.scope.resolve(
    ARTISAN_PROFILE_MODULE
  )
  const { location } = req.query
  const { limit, offset } = normalizePagination(req.query)
  const [profiles, count] = await artisanProfileService.listAndCountArtisanProfiles(
    {
      verification_status: "approved",
      ...(location ? { location: String(location) } : {}),
    },
    {
      take: limit,
      skip: offset,
    }
  )

  res.json({
    artisan_profiles: profiles,
    count,
    limit,
    offset,
    has_more: offset + profiles.length < count,
  })
}
