import { defineMiddlewares } from "@medusajs/framework/http"

/**
 * The media upload route accepts base64 JSON.  A 10 MB decoded file expands
 * to roughly 13.4 MB in base64, so leave a little room for the JSON envelope
 * while keeping the limit scoped to this route only.
 */
export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/artisan-profiles/:id/media/upload",
      methods: ["POST"],
      bodyParser: { sizeLimit: "15mb" },
    },
  ],
})
