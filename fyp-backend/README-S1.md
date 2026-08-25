# S1 工匠档案与接口说明

这份文档是 S1 的接口契约。S2、S3、S4 可以先按照这里的 URL、请求字段和
返回 JSON 开发，不需要等待所有后端功能完成。

## 一、本地启动

在 `fyp-backend` 目录执行：

```powershell
pnpm install
pnpm medusa db:migrate
pnpm dev
```

- 后端地址：`http://localhost:9000`
- Medusa 管理后台：`http://localhost:9000/app`
- 如果终端显示 `Server is ready on port: 9000`，说明后端启动成功。
- `redisUrl not found` 和本地 Stripe 未配置属于当前开发环境提示，不影响基础接口。

## 二、工匠展示接口（Store API）

商城前台使用以下接口读取工匠资料：

```text
GET /store/artisans
GET /store/artisans/:id
```

只有 `verification_status` 为 `approved` 的工匠会被返回。前端请求需要带
Medusa 的公开 API key：

```text
x-publishable-api-key: <本地 publishable key>
```

例如：

```powershell
curl.exe http://localhost:9000/store/artisans `
  -H "x-publishable-api-key: <本地 publishable key>"
```

## 三、工匠管理接口（Admin API）

这些接口需要先登录 `http://localhost:9000/app`，不能直接用商城公开 key 调用。

```text
GET    /admin/artisan-profiles
POST   /admin/artisan-profiles
GET    /admin/artisan-profiles/:id
POST   /admin/artisan-profiles/:id
DELETE /admin/artisan-profiles/:id
```

创建或更新资料时，可以使用以下字段：

```json
{
  "store_id": "store-id",
  "display_name": "Example artisan",
  "bio": "工匠简介",
  "avatar_url": "https://example.com/avatar.png",
  "location": "Singapore",
  "specialties": ["ceramics", "woodwork"],
  "inspiration": "自然纹理与东方器物",
  "creative_process": "手绘草图、打样、烧制、质检",
  "media": [
    { "type": "image", "url": "https://example.com/work-1.jpg", "caption": "代表作品" }
  ],
  "verification_status": "draft"
}
```

字段含义：

- `display_name`：前台展示的工匠名称。
- `bio`：工匠简介。
- `specialties`：擅长领域数组。
- `inspiration`：创作灵感。
- `creative_process`：制作流程或工艺说明。
- `media`：作品媒体数组，`type` 当前支持 `image` 和 `video`。
- `verification_status`：建议先用 `draft`，审核通过后改为 `approved`，前台才会展示。

也可以在资料创建后追加一条作品媒体：

```text
POST /admin/artisan-profiles/:id/media
```

请求体：

```json
{
  "type": "image",
  "url": "https://example.com/work-2.jpg",
  "caption": "工作室作品"
}
```

## 四、定制订单接口（供 S2/S3 对接）

```text
GET   /store/custom-orders
POST  /store/custom-orders
GET   /store/custom-orders/:id
PATCH /store/custom-orders/:id
```

创建订单请求示例：

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

返回格式：

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

订单状态流转：

```text
request -> quote -> confirmed -> produced -> delivered
request/quote/confirmed -> cancelled
```

## 五、定制订单聊天接口

聊天消息按订单保存，商城前台、工匠页面和管理后台可以共用这组接口：

```text
GET  /store/custom-orders/:id/messages
POST /store/custom-orders/:id/messages
```

发送消息请求体：

```json
{
  "sender_type": "customer",
  "sender_id": "cus_01XYZ",
  "message": "可以把杯身改成深蓝色吗？",
  "attachments": [
    { "type": "image", "url": "https://example.com/reference.png" }
  ]
}
```

- `sender_type` 支持 `customer`、`artisan`、`admin`。
- `message` 必填，最多 5000 个字符。
- `attachments` 可以为空；附件类型支持 `image` 和 `file`。

查询消息返回：

```json
{
  "messages": [
    {
      "id": "com_01ABC",
      "custom_order_id": "cor_01ABC",
      "sender_type": "customer",
      "sender_id": "cus_01XYZ",
      "message": "可以把杯身改成深蓝色吗？",
      "attachments": [],
      "created_at": "2026-08-26T10:00:00.000Z"
    }
  ],
  "count": 1
}
```

## 六、推荐接口（S4 对接）

```text
GET /store/recommendations?product_id=prod_01ABC&limit=8
```

目前推荐模型还未接入，因此返回空数组，但字段格式已经固定：

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

## 七、卖家销售分析接口（S2 对接）

该接口需要管理员登录：

```text
GET /admin/analytics/sales?from=2026-08-01&to=2026-08-31&currency_code=cny
```

接口会按照日期和币种统计订单总额、订单数、平均客单价、每日销售额和热销商品。
没有符合条件的订单时，数值为 0，数组为空：

```json
{
  "period": {
    "from": "2026-08-01T00:00:00.000Z",
    "to": "2026-08-31T00:00:00.000Z"
  },
  "currency_code": "cny",
  "summary": {
    "revenue": 0,
    "orders": 0,
    "average_order_value": 0
  },
  "top_products": [],
  "daily": []
}
```

## 八、给其他成员的对接顺序

1. 先启动后端并确认 `http://localhost:9000` 可访问。
2. 前端成员使用 `GET /store/artisans` 获取工匠列表。
3. 工匠详情页使用 `GET /store/artisans/:id`。
4. 定制订单页面按照第四、第五节接入订单和聊天。
5. 推荐页面先按照第六节的空数组格式开发，后续替换模型即可。
6. 分析页面按照第七节读取统计数据。

## 九、安全注意事项

不要提交以下文件或内容到 GitHub：

- `.env`、`.env.local`
- 数据库密码
- Stripe、MinIO、Resend 等 API key
- 任何真实用户密码
