// Local UI preview only. All catalog requests are read-only and forwarded to Medusa.
const http = require("node:http")

const port = Number(process.env.RECOMMENDATION_PREVIEW_PORT) || 9101
const upstream =
  process.env.RECOMMENDATION_PREVIEW_UPSTREAM || "http://localhost:9000"
let mode = "products"

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${port}`)
      if (url.pathname === "/__preview/recommendations") {
        const requestedMode = url.searchParams.get("mode")
        if (["products", "empty", "error"].includes(requestedMode))
          mode = requestedMode
        res.setHeader("Content-Type", "application/json")
        res.end(JSON.stringify({ mode }))
        return
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405)
        res.end("Read-only preview")
        return
      }
      if (url.pathname === "/store/recommendations") {
        if (mode === "error") {
          res.writeHead(503)
          res.end("Preview service unavailable")
          return
        }
        let recommendations = []
        if (mode === "products") {
          const response = await fetch(
            `${upstream}/store/products?limit=24&fields=id,title,handle,thumbnail`,
            {
              headers: {
                "x-publishable-api-key":
                  req.headers["x-publishable-api-key"] || "",
              },
              signal: AbortSignal.timeout(5000),
            }
          )
          if (!response.ok) throw new Error("Catalog request failed")
          const { products } = await response.json()
          recommendations = products
            .filter(
              (product) => product.id !== url.searchParams.get("product_id")
            )
            .slice(0, Number(url.searchParams.get("limit")) || 4)
            .map((product, index) => ({
              product_id: product.id,
              title: product.title,
              handle: product.handle,
              thumbnail: product.thumbnail,
              score: 1 / (index + 1),
              reason: null,
            }))
        }
        res.setHeader("Content-Type", "application/json")
        res.end(
          JSON.stringify({
            recommendations,
            count: recommendations.length,
            source: "local_preview",
            model_version: "preview-only",
          })
        )
        return
      }
      const headers = { ...req.headers }
      delete headers.host
      delete headers.connection
      const response = await fetch(`${upstream}${req.url}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      })
      res.writeHead(response.status, {
        "Content-Type":
          response.headers.get("content-type") || "application/json",
      })
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch {
      res.writeHead(502)
      res.end("Preview upstream unavailable")
    }
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`Read-only recommendation preview: http://127.0.0.1:${port}`)
  })
