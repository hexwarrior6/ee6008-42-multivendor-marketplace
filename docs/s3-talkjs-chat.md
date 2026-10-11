# S3 TalkJS chat

The custom-order chat uses TalkJS in both the buyer storefront and the
merchant admin. Each custom order maps to one private TalkJS conversation.
The Medusa backend verifies access before it creates the conversation and
returns a user-scoped TalkJS token.

## Configuration

Add these variables to the backend service only:

```env
TALKJS_APP_ID=your_app_id
TALKJS_SECRET_KEY=your_secret_key
```

Never add the secret key to the storefront or commit it to Git. In the TalkJS
dashboard, enable **Authentication (identity verification)** before using the
live app. Conversation data is synchronized by the backend REST API and the
conversation ID is an HMAC rather than the public custom-order ID.

## Existing messages

When a TalkJS conversation is created for the first time, existing messages
from the local `custom_order_message` table are imported in chronological
order. Later messages are stored and delivered by TalkJS. The old local
message endpoints and table remain available as a migration source and a
rollback path.

## Endpoints

- `GET /store/custom-orders/:id/talkjs` prepares the buyer session.
- `GET /admin/custom-orders/:id/talkjs` prepares the merchant session.

Both endpoints require the existing Medusa authentication and custom-order
authorization checks.
