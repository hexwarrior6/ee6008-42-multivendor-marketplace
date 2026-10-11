import { ensureCustomOrderCategory } from "../setup-custom-order-category"

const existing = {
  id: "pcat-1",
  name: "Custom Order",
  handle: "custom-order",
  is_active: false,
  is_internal: true,
  metadata: { owner: "team" },
}
const setup = () => ({
  listProductCategories: jest.fn().mockResolvedValue([]),
  createProductCategories: jest
    .fn()
    .mockResolvedValue({ ...existing, is_active: true, is_internal: false }),
})
describe("standalone custom category setup", () => {
  it("creates only the missing formal category with an explicit stable handle", async () => {
    const service = setup()
    expect((await ensureCustomOrderCategory(service as never)).created).toBe(
      true
    )
    expect(service.createProductCategories).toHaveBeenCalledWith({
      name: "Custom Order",
      handle: "custom-order",
      is_active: true,
      is_internal: false,
      metadata: { custom_order_enabled: true },
    })
    expect(service.listProductCategories).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        select: expect.arrayContaining([
          "metadata",
          "is_active",
          "is_internal",
        ]),
      })
    )
  })
  it("reuses an existing category without publishing it or overwriting metadata", async () => {
    const service = setup()
    service.listProductCategories.mockResolvedValue([existing] as never)
    expect(await ensureCustomOrderCategory(service as never)).toEqual({
      category: existing,
      created: false,
    })
    expect(service.createProductCategories).not.toHaveBeenCalled()
  })
  it("refuses ambiguous name/handle matches", async () => {
    const service = setup()
    service.listProductCategories.mockResolvedValue([
      existing,
      { ...existing, id: "pcat-2" },
    ] as never)
    await expect(ensureCustomOrderCategory(service as never)).rejects.toThrow(
      "Multiple"
    )
    expect(service.createProductCategories).not.toHaveBeenCalled()
  })
  it("recovers a concurrent unique-handle winner without creating a second category", async () => {
    const service = setup()
    service.listProductCategories
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([existing] as never)
    service.createProductCategories.mockRejectedValue(
      new Error("unique handle")
    )
    expect(await ensureCustomOrderCategory(service as never)).toEqual({
      category: existing,
      created: false,
    })
  })
  it("does not hide an unrelated database creation error", async () => {
    const service = setup()
    service.createProductCategories.mockRejectedValue(
      new Error("database error")
    )
    await expect(ensureCustomOrderCategory(service as never)).rejects.toThrow(
      "database error"
    )
  })
})
