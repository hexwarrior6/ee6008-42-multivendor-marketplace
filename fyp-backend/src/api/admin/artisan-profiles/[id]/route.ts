import {
  type AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ARTISAN_PROFILE_MODULE,
  ArtisanProfileService,
} from "../../../../modules/artisan-profile"

type UpdateArtisanProfileBody = {
  display_name?: string
  bio?: string
  avatar_url?: string
  location?: string
  specialties?: string[]
  verification_status?: "draft" | "pending" | "approved" | "rejected"
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const artisanProfileService: ArtisanProfileService = req.scope.resolve(
    ARTISAN_PROFILE_MODULE
  )
  const artisanProfile = await artisanProfileService.retrieveArtisanProfile(req.params.id)

  res.json({ artisan_profile: artisanProfile })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<UpdateArtisanProfileBody>,
  res: MedusaResponse
) => {
  const artisanProfileService: ArtisanProfileService = req.scope.resolve(
    ARTISAN_PROFILE_MODULE
  )
  const { specialties, ...data } = req.body
  const artisanProfile = await artisanProfileService.updateArtisanProfiles({
    id: req.params.id,
    ...data,
    ...(specialties !== undefined
      ? { specialties: specialties as unknown as Record<string, unknown> }
      : {}),
  })

  res.json({ artisan_profile: artisanProfile })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const artisanProfileService: ArtisanProfileService = req.scope.resolve(
    ARTISAN_PROFILE_MODULE
  )
  await artisanProfileService.deleteArtisanProfiles(req.params.id)

  res.sendStatus(204)
}
