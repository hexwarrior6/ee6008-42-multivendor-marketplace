import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  ARTISAN_PROFILE_MODULE,
  ArtisanProfileService,
} from "../../../../../modules/artisan-profile"

type MediaBody = {
  type?: "image" | "video"
  url?: string
  caption?: string
}

export const POST = async (
  req: AuthenticatedMedusaRequest<MediaBody>,
  res: MedusaResponse
) => {
  const { type, url, caption } = req.body || {}
  if (!type || !url) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "type and url are required"
    )
  }

  const service: ArtisanProfileService = req.scope.resolve(
    ARTISAN_PROFILE_MODULE
  )
  const profile = await service.retrieveArtisanProfile(req.params.id)
  const existing = Array.isArray(profile.media) ? profile.media : []
  const media = [...existing, { type, url, ...(caption ? { caption } : {}) }]
  const updated = await service.updateArtisanProfiles({
    id: profile.id,
    media: media as unknown as Record<string, unknown>,
  })

  res.status(201).json({ artisan_profile: updated, media: media.at(-1) })
}
