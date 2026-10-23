import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
// Remote CI databases can take more than a minute to apply Medusa's complete
// migration set before the application starts accepting requests.
jest.setTimeout(600 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api }) => {
    describe("Ping", () => {
      it("ping the server health endpoint", async () => {
        const response = await api.get('/health')
        expect(response.status).toEqual(200)
      })
    })
  },
})
