import { POST } from "../route"

const body = { version: 2, quoted_amount: 680, currency_code: "cny" }
const setup = (payload: unknown = body, customer = "customer-1") => {
  const service = {
    retrieveCustomOrderRequest: jest
      .fn()
      .mockResolvedValue({
        id: "cor-1",
        customer_id: "customer-1",
        artisan_id: "art-1",
      }),
    updateCustomOrderAtomically: jest
      .fn()
      .mockResolvedValue({ id: "cor-1", status: "confirmed" }),
  }
  return {
    service,
    req: {
      params: { id: "cor-1" },
      body: payload,
      auth_context: { actor_type: "customer", actor_id: customer },
      scope: { resolve: () => service },
    } as never,
  }
}
describe("POST /store/custom-orders/:id/confirm", () => {
  it("passes the buyer's accepted quote and identity to the atomic service", async () => {
    const { service, req } = setup()
    const res = { json: jest.fn() }
    await POST(req, res as never)
    expect(service.updateCustomOrderAtomically).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "cor-1",
        status: "confirmed",
        actor: { actor_type: "customer", actor_id: "customer-1" },
        customer_confirmation: body,
      })
    )
    expect(res.json).toHaveBeenCalledWith({
      custom_order: { id: "cor-1", status: "confirmed" },
    })
  })
  it.each([
    {},
    { ...body, status: "produced" },
    { ...body, payment_status: "captured" },
    { ...body, version: "2" },
    { ...body, quoted_amount: 0 },
    { ...body, currency_code: "CNY" },
    [],
  ])("rejects malformed or extra fields %p", async (payload) => {
    const { service, req } = setup(payload)
    await expect(POST(req, {} as never)).rejects.toMatchObject({
      type: "invalid_data",
    })
    expect(service.updateCustomOrderAtomically).not.toHaveBeenCalled()
  })
  it("refuses another customer before mutation", async () => {
    const { service, req } = setup(body, "other")
    await expect(POST(req, {} as never)).rejects.toMatchObject({
      type: "forbidden",
    })
    expect(service.updateCustomOrderAtomically).not.toHaveBeenCalled()
  })
  it("does not hide version conflicts from the transactional service", async () => {
    const { service, req } = setup()
    service.updateCustomOrderAtomically.mockRejectedValue({ type: "conflict" })
    await expect(POST(req, {} as never)).rejects.toMatchObject({
      type: "conflict",
    })
  })
})
