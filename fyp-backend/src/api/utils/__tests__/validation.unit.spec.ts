import {
  normalizePagination,
  parseNonNegativeAmount,
  validateAttachments,
  validateArtisanMedia,
} from "../validation"

describe("shared API validation", () => {
  it("normalizes pagination and rejects invalid values", () => {
    expect(normalizePagination({ limit: "500", offset: "2" })).toEqual({
      limit: 100,
      offset: 2,
    })
    expect(() => normalizePagination({ limit: "0" })).toThrow("at least 1")
    expect(() => normalizePagination({ offset: "-1" })).toThrow(
      "non-negative integer"
    )
  })

  it("validates safe attachment URLs and limits", () => {
    expect(
      validateAttachments([
        {
          type: "image",
          url: "https://cdn.example.com/a.png",
          size: 1024,
          mime_type: "image/png",
        },
      ])
    ).toEqual([
      {
        type: "image",
        url: "https://cdn.example.com/a.png",
        size: 1024,
        mime_type: "image/png",
      },
    ])
    expect(() =>
      validateAttachments([
        { type: "image", url: "javascript:alert(1)" },
      ])
    ).toThrow("http or https")
    expect(() =>
      validateAttachments([
        { type: "image", url: "https://cdn.example.com/a.svg", mime_type: "image/svg+xml" },
      ])
    ).toThrow("safe raster")
  })

  it("keeps money in integer minor units", () => {
    expect(parseNonNegativeAmount(680, "budget_amount", { integer: true })).toBe(680)
    expect(() =>
      parseNonNegativeAmount(680.5, "budget_amount", { integer: true })
    ).toThrow("smallest currency unit")
    expect(() =>
      parseNonNegativeAmount(2_147_483_648, "budget_amount", { integer: true })
    ).toThrow("must not exceed 2147483647")
  })

  it("validates profile media records", () => {
    expect(
      validateArtisanMedia([
        { type: "video", url: "https://cdn.example.com/process.mp4" },
      ])
    ).toEqual([
      { type: "video", url: "https://cdn.example.com/process.mp4" },
    ])
    expect(() =>
      validateArtisanMedia([{ type: "image", url: "data:image/png;base64,abc" }])
    ).toThrow("http or https")
  })
})
