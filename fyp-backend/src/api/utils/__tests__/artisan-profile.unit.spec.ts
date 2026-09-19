import {
  resolveProfileVerificationStatus,
  toPublicArtisanProfile,
} from "../artisan-profile"

describe("artisan profile API boundaries", () => {
  it("removes private fields from the public Store representation", () => {
    const result = toPublicArtisanProfile({
      id: "art-1",
      store_id: "store-1",
      display_name: "Maker",
      bio: "Bio",
      artisan_user_id: "user-private",
      version: 7,
      verification_status: "approved",
    } as never)

    expect(result).toEqual({
      id: "art-1",
      store_id: "store-1",
      display_name: "Maker",
      bio: "Bio",
      inspiration: null,
      creative_process: null,
      avatar_url: null,
      location: null,
      specialties: null,
      media: null,
    })
    expect(result).not.toHaveProperty("artisan_user_id")
    expect(result).not.toHaveProperty("version")
    expect(result).not.toHaveProperty("verification_status")
  })

  it("returns approved seller content to pending after a public edit", () => {
    expect(
      resolveProfileVerificationStatus({
        isPlatformAdmin: false,
        currentStatus: "approved",
        hasPublicContentChanges: true,
      })
    ).toBe("pending")
    expect(
      resolveProfileVerificationStatus({
        isPlatformAdmin: true,
        currentStatus: "approved",
        hasPublicContentChanges: true,
      })
    ).toBeUndefined()
  })
})
