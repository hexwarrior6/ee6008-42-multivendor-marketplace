import { MedusaError } from "@medusajs/framework/utils"

type MediaRecord = {
  file_id?: unknown
  url?: unknown
}

const records = (media: unknown): MediaRecord[] =>
  (Array.isArray(media) ? media : []).filter(
    (item): item is MediaRecord => Boolean(item && typeof item === "object")
  )

export const collectMediaFileIds = (media: unknown) =>
  new Set(
    records(media)
      .map((item) => item.file_id)
      .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
      .map((id) => id.trim())
  )

/** Reject provider file IDs that were not created for this profile. */
export const assertMediaFileIdsBelongToProfile = (
  media: unknown,
  currentMedia: unknown
) => {
  const currentById = new Map(
    records(currentMedia)
      .filter((item): item is MediaRecord & { file_id: string } =>
        typeof item.file_id === "string" && Boolean(item.file_id.trim())
      )
      .map((item) => [item.file_id.trim(), item])
  )

  for (const item of records(media)) {
    if (item.file_id === undefined) {
      continue
    }
    if (typeof item.file_id !== "string" || !item.file_id.trim()) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "media.file_id must be a non-empty string"
      )
    }
    const fileId = item.file_id.trim()
    const existing = currentById.get(fileId)
    if (!existing) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "A media file_id must belong to this artisan profile"
      )
    }
    // A retained provider file must keep its server-recorded URL. This stops
    // a caller from re-pointing an owned file ID at arbitrary content.
    if (typeof item.url === "string" && typeof existing.url === "string" &&
      item.url.trim() !== existing.url.trim()) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A media file_id must keep its original URL"
      )
    }
  }
}

export const assertNoClientMediaFileIds = (media: unknown) => {
  if (collectMediaFileIds(media).size) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "file_id can only be assigned by the media upload endpoint"
    )
  }
}
