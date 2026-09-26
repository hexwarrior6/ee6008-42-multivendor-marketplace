"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { HttpTypes } from "@medusajs/types"
import { getCacheOptions } from "./cookies"

export const listRegions = async (forceRefresh = false) => {
  const next = forceRefresh
    ? undefined
    : {
        ...(await getCacheOptions("regions")),
      }

  return sdk.client
    .fetch<{ regions: HttpTypes.StoreRegion[] }>(`/store/regions`, {
      method: "GET",
      next,
      cache: forceRefresh ? "no-store" : "force-cache",
    })
    .then(({ regions }) => regions)
    .catch(medusaError)
}

export const retrieveRegion = async (id: string) => {
  const next = {
    ...(await getCacheOptions(["regions", id].join("-"))),
  }

  return sdk.client
    .fetch<{ region: HttpTypes.StoreRegion }>(`/store/regions/${id}`, {
      method: "GET",
      next,
      cache: "force-cache",
    })
    .then(({ region }) => region)
    .catch(medusaError)
}

const regionMap = new Map<string, HttpTypes.StoreRegion>()

const cacheRegions = (regions: HttpTypes.StoreRegion[]) => {
  regions.forEach((region) => {
    region.countries?.forEach((country) => {
      if (country?.iso_2) {
        regionMap.set(country.iso_2.toLowerCase(), region)
      }
    })
  })
}

export const getRegion = async (countryCode: string) => {
  try {
    const normalizedCountryCode = countryCode?.toLowerCase()

    if (regionMap.has(normalizedCountryCode)) {
      return regionMap.get(normalizedCountryCode)
    }

    const regions = await listRegions()

    if (!regions) {
      return null
    }

    cacheRegions(regions)

    let region = normalizedCountryCode
      ? regionMap.get(normalizedCountryCode)
      : regionMap.get("us")

    if (!region && normalizedCountryCode) {
      const freshRegions = await listRegions(true)
      cacheRegions(freshRegions)
      region = regionMap.get(normalizedCountryCode)
    }

    return region
  } catch (e: any) {
    return null
  }
}
