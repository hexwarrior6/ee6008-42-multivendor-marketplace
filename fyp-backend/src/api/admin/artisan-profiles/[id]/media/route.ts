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
  const normalizedUrl = url?.trim()
  const normalizedCaption = caption?.trim()

  if (!type || !normalizedUrl) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "type and url are required"
    )
  }

  if (type !== "image" && type !== "video") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "type must be image or video"
    )
  }

  try {
    const parsedUrl = new URL(normalizedUrl)
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error("unsupported protocol")
    }
  } catch {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "url must be a valid http(s) URL"
    )
  }

  if (normalizedCaption && normalizedCaption.length > 500) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "caption must be 500 characters or fewer"
    )
  }

  const service: ArtisanProfileService = req.scope.resolve(
    ARTISAN_PROFILE_MODULE
  )
  const profile = await service.retrieveArtisanProfile(req.params.id)
  const existing = Array.isArray(profile.media) ? profile.media : []
  const media = [
    ...existing,
    {
      type,
      url: normalizedUrl,
      ...(normalizedCaption ? { caption: normalizedCaption } : {}),
    },
  ]
  const updated = await service.updateArtisanProfiles({
    id: profile.id,
    media: media as unknown as Record<string, unknown>,
  })

  res.status(201).json({ artisan_profile: updated, media: media.at(-1) })
}
