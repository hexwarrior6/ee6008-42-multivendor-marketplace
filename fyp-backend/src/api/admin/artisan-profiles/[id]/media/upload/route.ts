import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import type { IFileModuleService } from "@medusajs/framework/types"
import {
  ARTISAN_PROFILE_MODULE,
  ArtisanProfileService,
} from "../../../../../../modules/artisan-profile"
import { requireArtisanProfileAccess } from "../../../../../utils/authz"

type UploadMediaBody = {
  type?: "image" | "video"
  filename?: string
  mime_type?: string
  mimeType?: string
  content?: string
  caption?: string
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

const invalidUpload = (message: string) =>
  new MedusaError(MedusaError.Types.INVALID_DATA, message)

const decodeBase64Content = (value: string) => {
  const dataUrl = value.match(/^data:([^;,]+);base64,(.*)$/s)
  const mimeTypeFromDataUrl = dataUrl?.[1]
  const encoded = (dataUrl?.[2] ?? value).replace(/\s/g, "")

  if (
    !encoded ||
    encoded.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
  ) {
    throw invalidUpload("content must be valid base64 data")
  }

  const buffer = Buffer.from(encoded, "base64")
  if (!buffer.length || buffer.length > MAX_UPLOAD_BYTES) {
    throw invalidUpload("content must be between 1 byte and 10 MB")
  }

  return { buffer, encoded, mimeTypeFromDataUrl }
}

const inferMediaType = (mimeType: string): "image" | "video" | undefined => {
  if (mimeType.startsWith("image/")) {
    return "image"
  }
  if (mimeType.startsWith("video/")) {
    return "video"
  }
  return undefined
}

const hasSignature = (buffer: Buffer, mimeType: string) => {
  const startsWith = (...bytes: number[]) =>
    bytes.every((value, index) => buffer[index] === value)
  if (mimeType === "image/png") {
    return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
  }
  if (mimeType === "image/jpeg") {
    return startsWith(0xff, 0xd8, 0xff)
  }
  if (mimeType === "image/gif") {
    return buffer.subarray(0, 4).toString("ascii") === "GIF8"
  }
  if (mimeType === "image/webp") {
    return buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
  }
  if (mimeType === "video/mp4" || mimeType === "video/quicktime") {
    return buffer.subarray(4, 8).toString("ascii") === "ftyp"
  }
  if (mimeType === "video/webm") {
    return startsWith(0x1a, 0x45, 0xdf, 0xa3)
  }
  return false
}

/**
 * Upload a base64-encoded image/video through Medusa's configured file
 * provider, then append the resulting public URL to the artisan profile.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<UploadMediaBody>,
  res: MedusaResponse
) => {
  const body = req.body || {}
  const filename = typeof body.filename === "string" ? body.filename.trim() : ""
  const rawContent = typeof body.content === "string" ? body.content.trim() : ""
  const rawMimeType = body.mime_type || body.mimeType || ""
  const mimeType = typeof rawMimeType === "string" ? rawMimeType.trim().toLowerCase() : ""

  if (!filename || !rawContent) {
    throw invalidUpload("filename and content are required")
  }

  // The local provider uses the filename when constructing its storage path.
  // Reject path separators and dot-segments so an uploaded name cannot escape
  // the configured upload directory.
  if (
    filename === "." ||
    filename === ".." ||
    /[/\\]/.test(filename) ||
    filename.length > 255
  ) {
    throw invalidUpload("filename must be a simple file name (max 255 characters)")
  }

  const { buffer, encoded, mimeTypeFromDataUrl } = decodeBase64Content(rawContent)
  const effectiveMimeType = (mimeType || mimeTypeFromDataUrl || "").toLowerCase()
  const inferredType = inferMediaType(effectiveMimeType)
  const mediaType = body.type || inferredType

  if (!inferredType || !mediaType || mediaType !== inferredType) {
    throw invalidUpload("type and mime_type must describe an image or video")
  }

  if (!hasSignature(buffer, effectiveMimeType)) {
    throw invalidUpload("content does not match the declared media type")
  }

  const fileModuleService = req.scope.resolve(
    Modules.FILE
  ) as IFileModuleService
  const artisanProfileService: ArtisanProfileService = req.scope.resolve(
    ARTISAN_PROFILE_MODULE
  )
  const profile = await artisanProfileService.retrieveArtisanProfile(req.params.id)
  await requireArtisanProfileAccess(req, profile)

  // The decoded buffer is used for an exact size check; the file module
  // receives the base64 payload as required by Medusa's file service.
  if (!buffer.length || buffer.length > MAX_UPLOAD_BYTES) {
    throw invalidUpload("content must be between 1 byte and 10 MB")
  }
  if (body.caption !== undefined &&
    (typeof body.caption !== "string" || body.caption.length > 500)) {
    throw invalidUpload("caption must be 500 characters or fewer")
  }

  const uploaded = await fileModuleService.createFiles({
    filename,
    mimeType: effectiveMimeType,
    content: encoded,
    access: "public",
  })

  const existing = Array.isArray(profile.media) ? profile.media : []
  const media = [
    ...existing,
    {
      type: mediaType,
      url: uploaded.url,
      file_id: uploaded.id,
      filename,
      ...(body.caption?.trim() ? { caption: body.caption.trim() } : {}),
    },
  ]

  try {
    const updated = await artisanProfileService.updateArtisanProfiles({
      id: profile.id,
      media: media as unknown as Record<string, unknown>,
    })

    res.status(201).json({
      artisan_profile: updated,
      media: media.at(-1),
      file: uploaded,
    })
  } catch (error) {
    // Avoid leaving an orphaned object if writing the profile fails.
    try {
      await fileModuleService.deleteFiles(uploaded.id)
    } catch {
      // Preserve the original profile update error.
    }
    throw error
  }
}
