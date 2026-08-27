import {
  type AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import type { IFileModuleService } from "@medusajs/framework/types"
import {
  ARTISAN_PROFILE_MODULE,
  ArtisanProfileService,
} from "../../../../modules/artisan-profile"
import {
  getBackofficeAccess,
  requireArtisanProfileAccess,
} from "../../../utils/authz"
import {
  validateArtisanMedia,
  validateStringArray,
} from "../../../utils/validation"
import { dismissProfileStoreLink } from "../../../utils/module-links"
import {
  assertMediaFileIdsBelongToProfile,
  collectMediaFileIds,
} from "../../../utils/media-security"

type UpdateArtisanProfileBody = {
  artisan_user_id?: string | null
  display_name?: string
  bio?: string | null
  inspiration?: string | null
  creative_process?: string | null
  avatar_url?: string | null
  location?: string | null
  specialties?: string[] | null
  media?: Array<{
    type: "image" | "video"
    url: string
    caption?: string
    file_id?: string
    filename?: string
  }> | null
  verification_status?: "draft" | "pending" | "approved" | "rejected"
}

const validateOptionalText = (
  value: unknown,
  field: string,
  maxLength: number
) => {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }
  if (typeof value !== "string" || value.length > maxLength) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `${field} must be ${maxLength} characters or fewer`
    )
  }
  return value.trim()
}

const getAuthorizedProfile = async (req: AuthenticatedMedusaRequest) => {
  const access = await getBackofficeAccess(req)
  const service: ArtisanProfileService = req.scope.resolve(
    ARTISAN_PROFILE_MODULE
  )
  const profile = await service.retrieveArtisanProfile(req.params.id)
  await requireArtisanProfileAccess(req, profile)
  return { access, service, profile }
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { profile } = await getAuthorizedProfile(req)
  res.json({ artisan_profile: profile })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<UpdateArtisanProfileBody>,
  res: MedusaResponse
) => {
  const { access, service, profile: current } = await getAuthorizedProfile(req)
  const body = req.body || {}

  if (
    body.verification_status !== undefined &&
    !["draft", "pending", "approved", "rejected"].includes(body.verification_status)
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid verification_status"
    )
  }
  if (!access.isPlatformAdmin &&
    body.verification_status !== undefined &&
    body.verification_status !== "draft" &&
    body.verification_status !== "pending") {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Only a platform administrator can approve or reject an artisan profile"
    )
  }
  if (!access.isPlatformAdmin && current.verification_status === "approved" &&
    body.verification_status !== undefined) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "An approved profile status can only be changed by a platform administrator"
    )
  }
  if (body.artisan_user_id !== undefined && !access.isPlatformAdmin) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Only a platform administrator can change artisan ownership"
    )
  }
  if (
    body.artisan_user_id !== undefined &&
    body.artisan_user_id !== null &&
    typeof body.artisan_user_id !== "string"
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "artisan_user_id must be a string or null"
    )
  }
  if (access.isPlatformAdmin && typeof body.artisan_user_id === "string" &&
    body.artisan_user_id.trim()) {
    try {
      const userService = req.scope.resolve(Modules.USER)
      await userService.retrieveUser(body.artisan_user_id.trim())
    } catch {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "artisan_user_id does not reference an existing user"
      )
    }
  }

  const specialties = body.specialties === undefined
    ? undefined
    : validateStringArray(body.specialties, "specialties")
  const media = body.media === undefined
    ? undefined
    : validateArtisanMedia(body.media)
  if (body.display_name !== undefined &&
    (typeof body.display_name !== "string" || !body.display_name.trim())) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "display_name must be a non-empty string"
    )
  }
  const displayName = body.display_name === undefined
    ? undefined
    : validateOptionalText(body.display_name, "display_name", 200)
  if (displayName === null) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "display_name cannot be null"
    )
  }
  if (media !== undefined) {
    assertMediaFileIdsBelongToProfile(media, current.media)
  }
  const oldFileIds = collectMediaFileIds(current.media)
  const updated = await service.updateArtisanProfileAtomically({
    id: current.id,
    expectedVersion: Number(current.version ?? 0),
    data: {
      ...(body.artisan_user_id !== undefined && access.isPlatformAdmin
        ? {
            artisan_user_id:
              typeof body.artisan_user_id === "string"
                ? body.artisan_user_id.trim() || null
                : null,
          }
        : {}),
      ...(displayName !== undefined ? { display_name: displayName } : {}),
      ...(body.bio !== undefined
        ? { bio: validateOptionalText(body.bio, "bio", 5000) }
        : {}),
      ...(body.inspiration !== undefined
        ? { inspiration: validateOptionalText(body.inspiration, "inspiration", 5000) }
        : {}),
      ...(body.creative_process !== undefined
        ? { creative_process: validateOptionalText(body.creative_process, "creative_process", 5000) }
        : {}),
      ...(body.avatar_url !== undefined
        ? { avatar_url: validateOptionalText(body.avatar_url, "avatar_url", 2000) }
        : {}),
      ...(body.location !== undefined
        ? { location: validateOptionalText(body.location, "location", 200) }
        : {}),
      ...(specialties !== undefined
        ? { specialties: (specialties ?? null) as unknown as Record<string, unknown> }
        : {}),
      ...(media !== undefined
        ? { media: (media ?? null) as unknown as Record<string, unknown> }
        : {}),
      ...(body.verification_status !== undefined
        ? { verification_status: body.verification_status }
        : {}),
    },
  })

  // Remove files no longer referenced by the profile. Storage cleanup is
  // best-effort because the profile update has already succeeded.
  if (media !== undefined && oldFileIds.size) {
    const newFileIds = collectMediaFileIds(media)
    const fileService = req.scope.resolve(Modules.FILE) as IFileModuleService
    for (const fileId of oldFileIds) {
      if (!newFileIds.has(fileId)) {
        try {
          await fileService.deleteFiles(fileId)
        } catch {
          // Do not fail a successful profile update because storage cleanup
          // can be retried by an operator.
        }
      }
    }
  }

  res.json({ artisan_profile: updated })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { service, profile } = await getAuthorizedProfile(req)
  const fileIds = [...collectMediaFileIds(profile.media)]
  await service.deleteArtisanProfiles(profile.id)
  try {
    await dismissProfileStoreLink(req.scope, profile.store_id, profile.id)
  } catch {
    // Soft deletion and store_id still protect the data if link cleanup is
    // temporarily unavailable.
  }
  if (fileIds.length) {
    const fileService = req.scope.resolve(Modules.FILE) as IFileModuleService
    for (const fileId of fileIds) {
      try {
        await fileService.deleteFiles(fileId)
      } catch {
        // Profile deletion remains successful; stale storage can be cleaned
        // up separately.
      }
    }
  }
  res.sendStatus(204)
}
