import {
  type AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  ARTISAN_PROFILE_MODULE,
  ArtisanProfileService,
} from "../../../modules/artisan-profile"

type CreateArtisanProfileBody = {
  store_id?: string
  display_name?: string
  bio?: string
  inspiration?: string
  creative_process?: string
  avatar_url?: string
  location?: string
  specialties?: string[]
  media?: Array<{ type: "image" | "video"; url: string; caption?: string }>
  verification_status?: "draft" | "pending" | "approved" | "rejected"
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const artisanProfileService: ArtisanProfileService = req.scope.resolve(
    ARTISAN_PROFILE_MODULE
  )

  const { limit = 20, offset = 0, store_id, verification_status } = req.query
  const [profiles, count] = await artisanProfileService.listAndCountArtisanProfiles(
    {
      ...(store_id ? { store_id: String(store_id) } : {}),
      ...(verification_status
        ? { verification_status: String(verification_status) }
        : {}),
    },
    {
      take: Math.min(Number(limit) || 20, 100),
      skip: Number(offset) || 0,
    }
  )

  res.json({ artisan_profiles: profiles, count, limit: Number(limit), offset: Number(offset) })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<CreateArtisanProfileBody>,
  res: MedusaResponse
) => {
  const { store_id, display_name, specialties, media, ...data } = req.body

  if (!store_id || !display_name) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "store_id and display_name are required"
    )
  }

  const artisanProfileService: ArtisanProfileService = req.scope.resolve(
    ARTISAN_PROFILE_MODULE
  )
  const artisanProfile = await artisanProfileService.createArtisanProfiles({
    store_id,
    display_name,
    ...data,
    ...(specialties !== undefined
      ? { specialties: specialties as unknown as Record<string, unknown> }
      : {}),
    ...(media !== undefined
      ? { media: media as unknown as Record<string, unknown> }
      : {}),
  })

  res.status(201).json({ artisan_profile: artisanProfile })
}
