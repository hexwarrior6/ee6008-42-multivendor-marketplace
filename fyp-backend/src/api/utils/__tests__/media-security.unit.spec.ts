import {
  assertMediaFileIdsBelongToProfile,
  assertNoClientMediaFileIds,
  collectMediaFileIds,
} from "../media-security"

describe("artisan media file ownership", () => {
  const current = [
    {
      type: "image",
      url: "https://cdn.example.com/owned.png",
      file_id: "file_owned",
    },
  ]

  it("accepts only file IDs already attached to the profile", () => {
    expect(collectMediaFileIds(current)).toEqual(new Set(["file_owned"]))
    expect(() =>
      assertMediaFileIdsBelongToProfile(current, current)
    ).not.toThrow()
  })

  it("rejects a file ID copied from another profile", () => {
    expect(() =>
      assertMediaFileIdsBelongToProfile(
        [{ type: "image", url: "https://cdn.example.com/other.png", file_id: "file_other" }],
        current
      )
    ).toThrow("must belong")
  })

  it("rejects re-pointing an owned file ID at another URL", () => {
    expect(() =>
      assertMediaFileIdsBelongToProfile(
        [{ type: "image", url: "https://cdn.example.com/forged.png", file_id: "file_owned" }],
        current
      )
    ).toThrow("original URL")
  })

  it("rejects file IDs on URL-only create/update inputs", () => {
    expect(() =>
      assertNoClientMediaFileIds([
        { type: "image", url: "https://cdn.example.com/forged.png", file_id: "file_other" },
      ])
    ).toThrow("upload endpoint")
  })
})
