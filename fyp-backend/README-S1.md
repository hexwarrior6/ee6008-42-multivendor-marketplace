# S1 Artisan Profile API

## Local startup

```powershell
pnpm install
pnpm medusa db:migrate
pnpm dev
```

Backend: `http://localhost:9000`

Admin: `http://localhost:9000/app`

## Store API

The store endpoints only return profiles whose `verification_status` is `approved`.

```text
GET /store/artisans
GET /store/artisans/:id
```

Store requests need the publishable key header:

```text
x-publishable-api-key: <local publishable key>
```

## Admin API

```text
GET    /admin/artisan-profiles
POST   /admin/artisan-profiles
GET    /admin/artisan-profiles/:id
POST   /admin/artisan-profiles/:id
DELETE /admin/artisan-profiles/:id
```

Create/update fields:

```json
{
  "store_id": "store-id",
  "display_name": "Example artisan",
  "bio": "Short introduction",
  "avatar_url": "https://example.com/avatar.png",
  "location": "Singapore",
  "specialties": ["ceramics", "woodwork"],
  "verification_status": "draft"
}
```

Do not commit `.env`, `.env.local`, database passwords, or API keys.

## S1 contracts for the other workstreams

The following routes are intentionally available before the full custom-order
and recommendation implementations are finished. S2, S3, and S4 can develop
against these response shapes without waiting for the final integrations.

### Custom orders

```text
GET   /store/custom-orders
POST  /store/custom-orders
GET   /store/custom-orders/:id
PATCH /store/custom-orders/:id
```

Create request:

```json
{
  "artisan_id": "art_01ABC",
  "customer_id": "cus_01XYZ",
  "title": "青花瓷茶壶定制",
  "description": "希望壶身有梅花图案，容量约 500ml",
  "budget_amount": 680,
  "currency_code": "cny",
  "metadata": { "reference_image_url": null }
}
```

Create response:

```json
{
  "custom_order": {
    "id": "cor_01ABC",
    "status": "request",
    "artisan_id": "art_01ABC",
    "customer_id": "cus_01XYZ",
    "title": "青花瓷茶壶定制",
    "description": "希望壶身有梅花图案，容量约 500ml",
    "budget_amount": 680,
    "quoted_amount": null,
    "currency_code": "cny"
  }
}
```

Allowed status transitions are:

```text
request -> quote -> confirmed -> produced -> delivered
request/quote/confirmed -> cancelled
```

### Recommendations

```text
GET /store/recommendations?product_id=prod_01ABC&limit=8
```

The baseline response is empty until S4 registers the model. The response
shape will not change when the model is connected:

```json
{
  "recommendations": [],
  "count": 0,
  "limit": 8,
  "source": "model_pending",
  "model_version": "contract-v1",
  "context": { "product_id": "prod_01ABC" }
}
```

### Seller analytics

```text
GET /admin/analytics/sales?from=2026-08-01&to=2026-08-31&currency_code=cny
```

The first implementation returns a zero-valued baseline so S2 can build the
dashboard charts. Aggregation will be filled in without changing this shape:

```json
{
  "period": { "from": "2026-08-01T00:00:00.000Z", "to": "2026-08-31T00:00:00.000Z" },
  "currency_code": "cny",
  "summary": { "revenue": 0, "orders": 0, "average_order_value": 0 },
  "top_products": [],
  "daily": []
}
```
