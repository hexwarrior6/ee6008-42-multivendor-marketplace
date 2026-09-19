import "server-only"

import { sdk } from "@lib/config"
import { listProducts } from "@lib/data/products"
import { HttpTypes } from "@medusajs/types"
import { StoreProductWithStore } from "types/global"

export type ArtisanProfile = {
  id: string
  store_id: string
  display_name: string
  bio: string | null
  inspiration: string | null
  creative_process: string | null
  avatar_url: string | null
  location: string | null
  specialties: string[] | null
  media: ArtisanProfileMedia[]
}

export type ArtisanProfileMedia = {
  type: "image" | "video"
  url: string
  caption?: string | null
  file_id?: string
  filename?: string
}

type S1ArtisanProfileResponse = {
  artisan_profile: ArtisanProfile
}

type S1ArtisanProfileListResponse = {
  artisan_profiles: ArtisanProfile[]
  count: number
  limit: number
  offset: number
  has_more: boolean
}

export async function retrieveArtisanProfile(
  artisanIdOrStoreId: string
): Promise<ArtisanProfile | null> {
  if (!artisanIdOrStoreId) {
    return null
  }

  const profile = await sdk.client
    .fetch<S1ArtisanProfileResponse>(`/store/artisans/${artisanIdOrStoreId}`, {
      method: "GET",
      cache: "no-store",
    })
    .then(({ artisan_profile }) => normalizeProfileMedia(artisan_profile))
    .catch(() => null)

  if (profile) {
    return profile
  }

  const profileByStore = await retrieveArtisanProfileByStoreId(
    artisanIdOrStoreId
  )

  if (profileByStore) {
    return profileByStore
  }

  return null
}

export async function listArtisanProfiles(): Promise<ArtisanProfile[]> {
  const { artisan_profiles } = await sdk.client
    .fetch<S1ArtisanProfileListResponse>("/store/artisans", {
      method: "GET",
      query: {
        limit: 100,
        offset: 0,
      },
      cache: "no-store",
    })
    .catch(() => ({
      artisan_profiles: [],
      count: 0,
      limit: 100,
      offset: 0,
      has_more: false,
    }))

  return artisan_profiles.map(normalizeProfileMedia)
}

export async function retrieveArtisanProfileByStoreId(
  storeId: string
): Promise<ArtisanProfile | null> {
  const profiles = await listArtisanProfiles()
  return profiles.find((profile) => profile.store_id === storeId) ?? null
}

function normalizeProfileMedia(profile: ArtisanProfile): ArtisanProfile {
  return {
    ...profile,
    specialties: Array.isArray(profile.specialties)
      ? profile.specialties
      : null,
    media: Array.isArray(profile.media) ? profile.media : [],
  }
}

export async function listArtisanProducts({
  storeId,
  countryCode,
}: {
  storeId: string
  countryCode: string
}): Promise<HttpTypes.StoreProduct[]> {
  const { response } = await listProducts({
    countryCode,
    queryParams: {
      limit: 100,
    },
  })

  return (response.products as StoreProductWithStore[]).filter((product) => {
    return product.store?.id === storeId
  })
}
