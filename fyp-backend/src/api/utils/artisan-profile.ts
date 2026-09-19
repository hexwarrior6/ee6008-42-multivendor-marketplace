export type ArtisanVerificationStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"

type PublicArtisanProfileSource = {
  id: string
  store_id: string
  display_name: string
  bio?: string | null
  inspiration?: string | null
  creative_process?: string | null
  avatar_url?: string | null
  location?: string | null
  specialties?: unknown
  media?: unknown
}

/** Keep authentication, moderation, and concurrency fields out of Store APIs. */
export const toPublicArtisanProfile = (profile: PublicArtisanProfileSource) => ({
  id: profile.id,
  store_id: profile.store_id,
  display_name: profile.display_name,
  bio: profile.bio ?? null,
  inspiration: profile.inspiration ?? null,
  creative_process: profile.creative_process ?? null,
  avatar_url: profile.avatar_url ?? null,
  location: profile.location ?? null,
  specialties: profile.specialties ?? null,
  media: profile.media ?? null,
})

/** Public content edited by a seller must pass moderation again. */
export const resolveProfileVerificationStatus = (input: {
  isPlatformAdmin: boolean
  currentStatus: ArtisanVerificationStatus
  hasPublicContentChanges: boolean
  requestedStatus?: ArtisanVerificationStatus
}): ArtisanVerificationStatus | undefined => {
  if (
    !input.isPlatformAdmin &&
    input.currentStatus === "approved" &&
    input.hasPublicContentChanges
  ) {
    return "pending"
  }
  return input.requestedStatus
}
