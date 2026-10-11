import { mkdtemp, open, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  ARTIFACT_MAX_BYTES,
  parseRecommendationArtifact,
  readRecommendationArtifact,
  recommendationLists,
} from "../artifact"
const now = Date.parse("2026-10-11T00:00:00Z")
const valid = () => ({
  source: "als",
  model_version: "reco-v1-test",
  generated_at: new Date(now).toISOString(),
  by_user: { cus_1: [{ product_id: "prod_1", score: -0.5, reason: null }] },
  by_product: { prod_2: [{ product_id: "prod_1", score: 0.7 }] },
  fallback: [{ product_id: "prod_3", score: 1 }],
})
describe("S4 JSON artifact", () => {
  let directory: string, file: string
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "s1-recommendation-"))
    file = join(directory, "recommendations.json")
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })
  it("accepts S4 optional/null fields, signed scores and fixed selection priority", async () => {
    await writeFile(file, JSON.stringify(valid()))
    const result = await readRecommendationArtifact(file, "86400", now)
    expect(result.artifact?.source).toBe("als")
    expect(
      recommendationLists(result.artifact!, "cus_1", "prod_2").map(
        (x) => x.strategy
      )
    ).toEqual(["by_user", "by_product", "fallback"])
  })
  it("does not resolve inherited object keys as customers/products", () => {
    expect(
      recommendationLists(
        parseRecommendationArtifact(valid()),
        "constructor",
        "toString"
      )
        .slice(0, 2)
        .every((x) => x.items.length === 0)
    ).toBe(true)
  })
  it.each([
    { source: "rules" },
    { model_version: "../secret" },
    { generated_at: "2026-02-30T00:00:00Z" },
    { generated_at: "2026-10-11" },
    { by_user: [] },
    { by_product: null },
    { fallback: {} },
    { fallback: [{ product_id: "../secret", score: 1 }] },
    { fallback: [{ product_id: "prod_1", score: "1" }] },
    { fallback: [{ product_id: "prod_1", score: Infinity }] },
    { fallback: [{ product_id: "prod_1", score: 1, reason: {} }] },
    {
      fallback: Array.from({ length: 201 }, () => ({
        product_id: "prod_1",
        score: 1,
      })),
    },
  ])("rejects invalid contracts %j", (change) => {
    expect(() =>
      parseRecommendationArtifact({ ...valid(), ...change })
    ).toThrow("Invalid")
  })
  it("returns non-sensitive missing/corrupt file reasons", async () => {
    expect(await readRecommendationArtifact("", "86400", now)).toEqual({
      reason: "not_configured",
    })
    expect(await readRecommendationArtifact(file, "86400", now)).toEqual({
      reason: "unavailable",
    })
    await writeFile(file, "{broken")
    expect(await readRecommendationArtifact(file, "86400", now)).toEqual({
      reason: "invalid",
    })
  })
  it("rejects expired and implausibly future artifacts", async () => {
    await writeFile(file, JSON.stringify(valid()))
    expect(
      await readRecommendationArtifact(file, "86400", now + 86400001)
    ).toEqual({ reason: "expired" })
    expect(
      await readRecommendationArtifact(file, "86400", now - 300001)
    ).toEqual({ reason: "invalid" })
  })
  it.each(["0", "NaN", "2592001", "1.2"])(
    "rejects invalid age config %s",
    async (age) => {
      expect(await readRecommendationArtifact(file, age, now)).toEqual({
        reason: "invalid",
      })
    }
  )
  it("refuses oversized files before JSON parsing", async () => {
    const h = await open(file, "w")
    try {
      await h.truncate(ARTIFACT_MAX_BYTES + 1)
    } finally {
      await h.close()
    }
    expect(await readRecommendationArtifact(file, "86400", now)).toEqual({
      reason: "invalid",
    })
  })
  it("reads replacement results without a stale per-user cache", async () => {
    await writeFile(file, JSON.stringify(valid()))
    expect(
      (await readRecommendationArtifact(file, "86400", now)).artifact?.source
    ).toBe("als")
    await writeFile(file, JSON.stringify({ ...valid(), source: "svd" }))
    expect(
      (await readRecommendationArtifact(file, "86400", now)).artifact?.source
    ).toBe("svd")
  })
})
