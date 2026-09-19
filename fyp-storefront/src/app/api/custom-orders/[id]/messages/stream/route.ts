import { getAuthHeaders } from "@lib/data/cookies"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) {
    return Response.json({ message: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  const backendUrl = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
  const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
  const upstream = await fetch(
    `${backendUrl}/store/custom-orders/${encodeURIComponent(
      id
    )}/messages/stream`,
    {
      headers: {
        accept: "text/event-stream",
        authorization: headers.authorization,
        ...(publishableKey ? { "x-publishable-api-key": publishableKey } : {}),
      },
      cache: "no-store",
    }
  )

  if (!upstream.ok || !upstream.body) {
    return Response.json(
      { message: "Unable to connect to the message stream" },
      { status: upstream.status || 502 }
    )
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
