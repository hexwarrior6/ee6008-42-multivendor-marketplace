import {
  type AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  ARTISAN_PROFILE_MODULE,
  ArtisanProfileService,
} from "../../../modules/artisan-profile"
import {
  getBackofficeAccess,
  requireStoreOwnership,
  securityLog,
} from "../../utils/authz"
import {
  normalizePagination,
  validateArtisanMedia,
  validateStringArray,
} from "../../utils/validation"
import {
  dismissProfileStoreLink,
  linkProfileToStore,
} from "../../utils/module-links"

type CreateArtisanProfileBody = {
  store_id?: string
  artisan_user_id?: string
  display_name?: string
  bio?: string
  inspiration?: string
  creative_process?: string
  avatar_url?: string
  location?: string
  specialties?: string[]
  media?: Array<{
    type: "image" | "video"
    url: string
    caption?: string
    file_id?: string
    filename?: string
  }>
  verification_status?: "draft" | "pending" | "approved" | "rejected"
}

const validateText = (
  value: unknown,
  field: string,
  maxLength: number,
  options: { required?: boolean } = {}
) => {
  if (value === undefined || value === null) {
    if (options.required) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `${field} is required`
      )
    }
    return undefined
  }
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `${field} must be a non-empty string of ${maxLength} characters or fewer`
    )
  }
  return value.trim()
}

const assertStoreExists = async (
  req: AuthenticatedMedusaRequest,
  storeId: string
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "store",
    fields: ["id"],
    filters: { id: storeId },
  })
  if (!data?.length) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Store not found")
  }
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const access = await getBackofficeAccess(req)
  const { limit, offset } = normalizePagination(req.query)
  const storeId = req.query.store_id ? String(req.query.store_id) : undefined
  const verificationStatus = req.query.verification_status
    ? String(req.query.verification_status)
    : undefined
  if (
    verificationStatus &&
    !["draft", "pending", "approved", "rejected"].includes(verificationStatus)
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid verification_status"
    )
  }

  if (!access.isPlatformAdmin) {
    if (storeId && !access.storeIds.includes(storeId)) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "You can only list profiles from your own store"
      )
    }
    if (!access.storeIds.length) {
      return res.json({
        artisan_profiles: [],
        count: 0,
        limit,
        offset,
        has_more: false,
      })
    }
  }

  const service: ArtisanProfileService = req.scope.resolve(
    ARTISAN_PROFILE_MODULE
  )
  const [profiles, count] = await service.listAndCountArtisanProfiles(
    {
      ...(storeId
        ? { store_id: storeId }
        : !access.isPlatformAdmin
          ? { store_id: access.storeIds }
          : {}),
      ...(verificationStatus ? { verification_status: verificationStatus } : {}),
    },
    { take: limit, skip: offset, order: { created_at: "DESC" } }
  )

  res.json({
    artisan_profiles: profiles,
    count,
    limit,
    offset,
    has_more: offset + profiles.length < count,
  })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<CreateArtisanProfileBody>,
  res: MedusaResponse
) => {
  const access = await getBackofficeAccess(req)
  const body = req.body || {}
  const displayName = validateText(body.display_name, "display_name", 200, {
    required: true,
  })!

  let storeId = typeof body.store_id === "string"
    ? body.store_id.trim()
    : undefined
  if (!storeId && !access.isPlatformAdmin && access.storeIds.length === 1) {
    storeId = access.storeIds[0]
  }
  if (!storeId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "store_id is required when the user owns more than one store"
    )
  }
  await assertStoreExists(req, storeId)
  await requireStoreOwnership(req, storeId)

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
    !["draft", "pending"].includes(body.verification_status)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Only a platform administrator can approve or reject an artisan profile"
    )
  }

  const specialties = validateStringArray(body.specialties, "specialties")
  const media = validateArtisanMedia(body.media)
  let artisanUserId: string | null = access.isPlatformAdmin
    ? null
    : access.context.actor_id
  if (access.isPlatformAdmin && body.artisan_user_id !== undefined) {
    if (typeof body.artisan_user_id !== "string") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "artisan_user_id must be a non-empty string or omitted"
      )
    }
    artisanUserId = body.artisan_user_id.trim()
    if (!artisanUserId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "artisan_user_id must be a non-empty string or omitted"
      )
    }
    try {
      const userService = req.scope.resolve(Modules.USER)
      await userService.retrieveUser(artisanUserId)
    } catch {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "artisan_user_id does not reference an existing user"
      )
    }
  }
  const service: ArtisanProfileService = req.scope.resolve(
    ARTISAN_PROFILE_MODULE
  )
  const profile = await service.createArtisanProfiles({
    store_id: storeId,
    artisan_user_id: artisanUserId,
    display_name: displayName,
    bio: validateText(body.bio, "bio", 5000) ?? null,
    inspiration: validateText(body.inspiration, "inspiration", 5000) ?? null,
    creative_process:
      validateText(body.creative_process, "creative_process", 5000) ?? null,
    avatar_url: validateText(body.avatar_url, "avatar_url", 2000) ?? null,
    location: validateText(body.location, "location", 200) ?? null,
    specialties: (specialties ?? null) as unknown as Record<string, unknown>,
    media: (media ?? null) as unknown as Record<string, unknown>,
    verification_status: body.verification_status ?? "draft",
  })

  try {
    await linkProfileToStore(req.scope, storeId, profile.id)
  } catch (error) {
    // Do not return a profile whose store link was not created.  Compensate
    // the aggregate so a retry cannot leave an orphan profile behind.
    securityLog(req, "artisan profile link creation failed", {
      profile_id: profile.id,
      store_id: storeId,
      error: error instanceof Error ? error.message : String(error),
    })
    try {
      await dismissProfileStoreLink(req.scope, storeId, profile.id)
    } catch (dismissError) {
      securityLog(req, "artisan profile link compensation failed", {
        profile_id: profile.id,
        store_id: storeId,
        error:
          dismissError instanceof Error
            ? dismissError.message
            : String(dismissError),
      })
    }
    try {
      await service.deleteArtisanProfiles(profile.id)
    } catch (compensationError) {
      securityLog(req, "artisan profile compensation failed", {
        profile_id: profile.id,
        store_id: storeId,
        error:
          compensationError instanceof Error
            ? compensationError.message
            : String(compensationError),
      })
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Artisan profile creation could not be completed consistently"
      )
    }
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Artisan profile could not be linked to its store"
    )
  }

  res.status(201).json({ artisan_profile: profile })
}
