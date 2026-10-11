# S3 Chinese storefront and WeChat Pay

The storefront uses Simplified Chinese copy for the main navigation, account
pages, product details, custom-order flow, cart, checkout and payment UI. The
document language is also set to `zh-CN`.

## Local mock mode

Set these backend variables for a local QR checkout without charging money:

```env
WECHAT_PAY_ENABLED=true
WECHAT_PAY_MODE=mock
WECHAT_PAY_SANDBOX=true
```

Mock mode creates a deterministic `weixin://` QR value and marks the payment
as locally authorised so the checkout flow can be tested end to end.

## Live API v3 mode

Use `WECHAT_PAY_MODE=live` only after configuring the merchant credentials:

```env
WECHAT_PAY_ENABLED=true
WECHAT_PAY_MODE=live
WECHAT_PAY_APP_ID=
WECHAT_PAY_MCH_ID=
WECHAT_PAY_API_V3_KEY=
WECHAT_PAY_MCH_SERIAL_NO=
WECHAT_PAY_PRIVATE_KEY=
WECHAT_PAY_NOTIFY_URL=https://your-backend.example/hooks/payment/pp_wechat_wechat
WECHAT_PAY_PUBLIC_KEY_ID=
WECHAT_PAY_PUBLIC_KEY=
WECHAT_PAY_API_BASE_URL=https://api.mch.weixin.qq.com
```

The provider validates API v3 signatures, decrypts transaction notifications,
supports native QR orders, status queries, cancellation and refunds. Run
`pnpm setup:wechat-pay` after enabling the provider to add CNY and the China
region payment method.

The TalkJS secret and WeChat merchant secrets stay in the backend environment
and must never be copied into the storefront or committed to Git.
