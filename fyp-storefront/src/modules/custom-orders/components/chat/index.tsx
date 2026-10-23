"use client"

import { Chatbox } from "@talkjs/react-components"
import "@talkjs/react-components/default.css"

import type { TalkJsSession } from "@lib/data/custom-orders"

export default function CustomOrderChat({
  session,
}: {
  session: TalkJsSession
}) {
  return (
    <div className="mt-4 overflow-hidden border border-ui-border-base bg-ui-bg-base">
      <Chatbox
        appId={session.app_id}
        userId={session.user_id}
        conversationId={session.conversation_id}
        token={session.token}
        chatHeaderVisible={false}
        style={{ width: "100%", height: "32rem" }}
      />
    </div>
  )
}
