import { MedusaError } from "@medusajs/framework/utils"

export type NormalizedPagination = {
  limit: number
  offset: number
}

const invalid = (message: string) =>
  new MedusaError(MedusaError.Types.INVALID_DATA, message)

const parseInteger = (value: unknown, fallback: number, field: string) => {
  if (value === undefined || value === null || value === "") {
    return fallback
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw invalid(`${field} must be a non-negative integer`)
  }

  return parsed
}

export const normalizePagination = (
  query: Record<string, unknown>,
  options: { defaultLimit?: number; maxLimit?: number } = {}
): NormalizedPagination => {
  const defaultLimit = options.defaultLimit ?? 20
  const maxLimit = options.maxLimit ?? 100
  const rawLimit = parseInteger(query.limit, defaultLimit, "limit")
  const offset = parseInteger(query.offset, 0, "offset")

  if (rawLimit < 1) {
    throw invalid("limit must be at least 1")
  }

  return { limit: Math.min(rawLimit, maxLimit), offset }
}

export const parseCurrencyCode = (value: unknown, fallback = "cny") => {
  if (value === undefined || value === null || value === "") {
    return fallback
  }
  if (typeof value !== "string") {
    throw invalid("currency_code must be a 3-letter ISO currency code")
  }
  const currency = value.trim().toLowerCase()
  if (!/^[a-z]{3}$/.test(currency)) {
    throw invalid("currency_code must be a 3-letter ISO currency code")
  }
  return currency
}

export const parseNonNegativeAmount = (
  value: unknown,
  field: string,
  options: { nullable?: boolean; integer?: boolean } = {}
): number | null | undefined => {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    if (options.nullable ?? true) {
      return null
    }
    throw invalid(`${field} is required`)
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw invalid(`${field} must be a non-negative number`)
  }
  if (options.integer && !Number.isInteger(value)) {
    throw invalid(`${field} must be an integer in the smallest currency unit`)
  }
  return value
}

export type MessageAttachment = {
  type: "image" | "file"
  url: string
  size?: number
  mime_type?: string
  name?: string
}

const MAX_ATTACHMENTS = 10
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024

export const validateAttachments = (
  value: unknown
): MessageAttachment[] | null => {
  if (value === undefined || value === null) {
    return null
  }
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) {
    throw invalid(`attachments must contain at most ${MAX_ATTACHMENTS} items`)
  }

  let totalSize = 0
  const result: MessageAttachment[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== "object") {
      throw invalid("each attachment must be an object")
    }
    const item = raw as Record<string, unknown>
    if (item.type !== "image" && item.type !== "file") {
      throw invalid("attachment type must be image or file")
    }
    if (typeof item.url !== "string" || !item.url.trim()) {
      throw invalid("attachment url is required")
    }

    let url: URL
    try {
      url = new URL(item.url.trim())
    } catch {
      throw invalid("attachment url must be a valid http(s) URL")
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw invalid("attachment url must use http or https")
    }

    const size = item.size
    if (size !== undefined) {
      if (typeof size !== "number" || !Number.isInteger(size) || size < 1) {
        throw invalid("attachment size must be a positive integer")
      }
      if (size > MAX_ATTACHMENT_BYTES) {
        throw invalid("each attachment must be 10 MB or smaller")
      }
      totalSize += size
    }

    const mimeType = item.mime_type
    if (mimeType !== undefined && (typeof mimeType !== "string" || !mimeType.trim())) {
      throw invalid("attachment mime_type must be a non-empty string")
    }
    if (item.type === "image" && typeof mimeType === "string" &&
      (!mimeType.toLowerCase().startsWith("image/") || mimeType.toLowerCase() === "image/svg+xml")) {
      throw invalid("image attachments must use a safe raster image mime type")
    }

    result.push({
      type: item.type,
      url: url.toString(),
      ...(typeof size === "number" ? { size } : {}),
      ...(typeof mimeType === "string" ? { mime_type: mimeType.trim().toLowerCase() } : {}),
      ...(typeof item.name === "string" && item.name.trim()
        ? { name: item.name.trim().slice(0, 255) }
        : {}),
    })
  }

  if (totalSize > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw invalid("attachments must be 25 MB or smaller in total")
  }

  return result
}

export const validateMetadata = (value: unknown) => {
  if (value === undefined || value === null) {
    return value ?? null
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw invalid("metadata must be a JSON object")
  }
  return value as Record<string, unknown>
}

export type ArtisanMediaItem = {
  type: "image" | "video"
  url: string
  caption?: string
  file_id?: string
  filename?: string
}

/** Validate the JSON media array stored on an artisan profile. */
export const validateArtisanMedia = (
  value: unknown
): ArtisanMediaItem[] | undefined => {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return []
  }
  if (!Array.isArray(value) || value.length > 100) {
    throw invalid("media must contain at most 100 items")
  }

  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object") {
      throw invalid(`media[${index}] must be an object`)
    }
    const item = raw as Record<string, unknown>
    if (item.type !== "image" && item.type !== "video") {
      throw invalid(`media[${index}].type must be image or video`)
    }
    if (typeof item.url !== "string" || !item.url.trim()) {
      throw invalid(`media[${index}].url is required`)
    }
    let parsedUrl: URL
    try {
      parsedUrl = new URL(item.url.trim())
    } catch {
      throw invalid(`media[${index}].url must be a valid http(s) URL`)
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw invalid(`media[${index}].url must use http or https`)
    }

    const caption = item.caption
    if (caption !== undefined &&
      (typeof caption !== "string" || caption.length > 500)) {
      throw invalid(`media[${index}].caption must be 500 characters or fewer`)
    }
    if (item.file_id !== undefined &&
      (typeof item.file_id !== "string" || !item.file_id.trim())) {
      throw invalid(`media[${index}].file_id must be a non-empty string`)
    }
    if (item.filename !== undefined &&
      (typeof item.filename !== "string" || !item.filename.trim() || item.filename.length > 255)) {
      throw invalid(`media[${index}].filename must be 255 characters or fewer`)
    }

    return {
      type: item.type,
      url: parsedUrl.toString(),
      ...(typeof caption === "string" && caption.trim()
        ? { caption: caption.trim() }
        : {}),
      ...(typeof item.file_id === "string" && item.file_id.trim()
        ? { file_id: item.file_id.trim() }
        : {}),
      ...(typeof item.filename === "string" && item.filename.trim()
        ? { filename: item.filename.trim().slice(0, 255) }
        : {}),
    }
  })
}

export const validateStringArray = (
  value: unknown,
  field: string,
  options: { maxItems?: number; maxLength?: number } = {}
): string[] | undefined => {
  if (value === undefined) {
    return undefined
  }
  const maxItems = options.maxItems ?? 20
  const maxLength = options.maxLength ?? 100
  if (!Array.isArray(value) || value.length > maxItems) {
    throw invalid(`${field} must contain at most ${maxItems} items`)
  }
  return value.map((item, index) => {
    if (typeof item !== "string" || !item.trim() || item.length > maxLength) {
      throw invalid(`${field}[${index}] must be a non-empty string of ${maxLength} characters or fewer`)
    }
    return item.trim()
  })
}
