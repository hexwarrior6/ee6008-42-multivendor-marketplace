export function getActivePaymentSession<T extends { status: string }>(sessions?: T[] | null): T | undefined {
  return sessions?.find(session =>
    ["pending", "requires_more", "authorized"].includes(session.status)
  )
}
