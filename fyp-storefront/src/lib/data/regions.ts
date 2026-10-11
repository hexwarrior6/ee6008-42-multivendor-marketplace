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

export const getRegion = async (countryCode: string) => {
  try {
    const normalizedCountryCode = countryCode?.trim().toLowerCase() || "us"
    // Cart mutations must use current currency/country settings, not process-wide snapshots.
    const regions = await listRegions(true)
    return regions?.find(region => region.countries?.some(
      country => country.iso_2?.toLowerCase() === normalizedCountryCode
    )) ?? null
  } catch (e: any) {
    return null
  }
}
