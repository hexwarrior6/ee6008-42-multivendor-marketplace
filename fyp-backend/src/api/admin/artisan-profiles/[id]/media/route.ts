import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import type { IFileModuleService } from "@medusajs/framework/types"
import {
  ARTISAN_PROFILE_MODULE,
  ArtisanProfileService,
} from "../../../../../modules/artisan-profile"
import { requireArtisanProfileAccess } from "../../../../utils/authz"
import { validateArtisanMedia } from "../../../../utils/validation"

type MediaBody = {
  type?: "image" | "video"
  url?: string
  caption?: string
  file_id?: string
  filename?: string
}

export const POST = async (
  req: AuthenticatedMedusaRequest<MediaBody>,
  res: MedusaResponse
) => {
  const { type, url, caption, file_id, filename } = req.body || {}
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
  await requireArtisanProfileAccess(req, profile)
  const existing = Array.isArray(profile.media) ? profile.media : []
  const media = validateArtisanMedia([
    ...existing,
    { type, url, caption, ...(file_id ? { file_id } : {}), ...(filename ? { filename } : {}) },
  ])!
  const updated = await service.updateArtisanProfiles({
    id: profile.id,
    media: media as unknown as Record<string, unknown>,
  })

  res.status(201).json({ artisan_profile: updated, media: media.at(-1) })
}

/** Remove one media item by its file id or URL. */
export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const service: ArtisanProfileService = req.scope.resolve(
    ARTISAN_PROFILE_MODULE
  )
  const profile = await service.retrieveArtisanProfile(req.params.id)
  await requireArtisanProfileAccess(req, profile)
  const body = (req.body || {}) as { file_id?: string; url?: string }
  if (
    (body.file_id !== undefined && typeof body.file_id !== "string") ||
    (body.url !== undefined && typeof body.url !== "string")
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "file_id and url must be strings"
    )
  }
  const fileId = body.file_id?.trim()
  const url = body.url?.trim()
  if (!fileId && !url) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "file_id or url is required"
    )
  }
  const existing = Array.isArray(profile.media) ? profile.media : []
  const removed = existing.filter((item) =>
    (fileId && item?.file_id === fileId) || (url && item?.url === url)
  )
  const media = existing.filter((item) =>
    !((fileId && item?.file_id === fileId) || (url && item?.url === url))
  )
  if (removed.length === existing.length) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Media item not found")
  }
  const updated = await service.updateArtisanProfiles({
    id: profile.id,
    media: media as unknown as Record<string, unknown>,
  })

  // Deleting the backing file is best effort; the profile is already
  // consistent even if a remote provider is temporarily unavailable.
  const removedFileIds = removed
    .map((item) => item?.file_id)
    .filter((id): id is string => typeof id === "string" && Boolean(id))
  for (const removedFileId of removedFileIds) {
    try {
      const fileService = req.scope.resolve(Modules.FILE) as IFileModuleService
      await fileService.deleteFiles(removedFileId)
    } catch {
      // Ignore storage cleanup failures.
    }
  }

  res.json({ artisan_profile: updated, removed })
}
