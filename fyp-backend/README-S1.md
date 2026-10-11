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

公开接口只返回展示所需的 `id`、`store_id`、`display_name`、`bio`、
`inspiration`、`creative_process`、`avatar_url`、`location`、`specialties` 和
`media`，不会返回 `artisan_user_id`、`version`、审核状态或内部时间字段。

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

卖家修改已经审核通过的公开字段或媒体后，档案会自动重置为 `pending`，必须由
平台管理员重新审核；平台管理员维护资料时不会自动改变审核状态。

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

如果前端需要直接上传文件，可以使用 base64 文件上传接口。接口需要管理员登录，支持图片和视频，
单个文件限制为 10 MB；文件会交给 Medusa 当前配置的 file provider（本地或 MinIO）保存：

```text
POST /admin/artisan-profiles/:id/media/upload
```

请求体：

```json
{
  "filename": "workshop.jpg",
  "mime_type": "image/jpeg",
  "type": "image",
  "content": "<base64-data>",
  "caption": "工作室照片"
}
```

上传成功后，返回的 `file.url` 和 `media.url` 可以直接用于前台展示；`media.file_id` 可用于后续
删除文件。默认使用 Medusa 本地 file provider；只有在配置完整 MinIO 信息并设置
`MINIO_ENABLED=true` 后才会切换到 MinIO。

## 四、定制订单接口（供 S2/S3 对接）

```text
GET   /store/custom-orders
POST  /store/custom-orders
GET   /store/custom-orders/:id
PATCH /store/custom-orders/:id
```

上述 Store 定制订单路由（包括消息等子路径）要求客户已登录。请求需携带
Medusa session cookie 或 bearer token，并由后端的
`authenticate("customer", ["session", "bearer"])` 中间件校验；只有
publishable API key 不能调用这些路由。订单创建时 `customer_id` 始终取自登录
身份，客户端传入的值会被忽略。

管理员订单列表和详情接口如下，必须先登录管理后台：

```text
GET   /admin/custom-orders
GET   /admin/custom-orders/:id
PATCH /admin/custom-orders/:id
```

列表接口支持 `artisan_id`、`customer_id`、`status`、`product_category`、
`limit` 和 `offset` 查询参数，供后台订单列表筛选和分页使用。

创建订单请求示例：

```json
{
  "artisan_id": "art_01ABC",
  "customer_id": "cus_01XYZ",
  "title": "青花瓷茶壶定制",
  "product_category": "ceramics",
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
    "product_category": "ceramics",
    "description": "希望壶身有梅花图案，容量约 500ml",
    "budget_amount": 680,
    "quoted_amount": null,
    "currency_code": "cny"
  }
}
```

`product_category` 是定制请求的产品类别，默认值为 `custom`，也可以使用
`ceramics`、`woodwork`、`jewelry` 等团队约定的分类名称。

`budget_amount` 和 `quoted_amount` 都是最小货币单位整数，合法范围为
`0` 到 `2,147,483,647`；超出范围会在写入数据库前返回参数错误。

若使用正式商品下单类型，请传 `listing_type: "product"`、`product_id` 和
`product_category_id`。后端会验证商品与类别的关系、商品是否已发布且有
variant、商品是否属于工匠所在店铺，以及商品或类别是否设置
`metadata.custom_order_enabled: true`。未通过这些检查的跨店铺、未发布或非定制
商品会返回错误；`listing_type: "custom_request"` 可继续使用纯描述型定制请求。

订单状态流转：

```text
request -> quote -> confirmed -> produced -> delivered
request/quote/confirmed -> cancelled
```

接口会拒绝跳跃或逆向状态，例如 `request -> produced`、
`delivered -> confirmed` 都会返回错误。状态更新通过后端工作流执行，后续可以在
工作流中加入通知、审核记录和生产任务等步骤。

付款状态不能任意倒退：`pending` 可以进入 `authorized`、`captured` 或 `failed`，
`authorized` 可以进入 `captured` 或 `failed`，`captured` 不能改回未付款状态；
已交付或取消的订单不能再修改付款状态。

## 五、定制订单聊天接口

聊天消息按订单保存，商城前台、工匠页面和管理后台可以共用这组接口：

```text
GET  /store/custom-orders/:id/messages
POST /store/custom-orders/:id/messages
```

后台工匠/管理员使用对应的后台接口：

```text
GET  /admin/custom-orders/:id/messages
POST /admin/custom-orders/:id/messages
GET  /admin/custom-orders/:id/history
```

发送消息请求体（`sender_type` 和 `sender_id` 即使传入也会被服务端忽略）：

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

- 发送者类型和 ID 始终从登录身份生成，客户不能伪装成工匠或管理员；只有订单客户、对应工匠和平台管理员可以读取消息。
- `sender_type` 的返回值支持 `customer`、`artisan`、`admin`。
- `message` 必填，最多 5000 个字符。
- `attachments` 可以为空；附件类型支持 `image` 和 `file`，单个最多 10 MB、总计最多 25 MB，并要求 HTTP(S) URL。
- 查询支持 `limit` 和 `offset`，响应会返回 `count`、`limit`、`offset` 和 `has_more`。

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

接口会按照日期、币种和可选的 `store_id` 统计订单总额、订单数、平均客单价、每日销售额和热销商品。
平台管理员不传 `store_id` 时统计全平台；普通卖家始终只会看到自己关联店铺的数据，不能用查询参数扩大范围。
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
  "daily": [],
  "truncated": false
}
```

为了限制单次分析的内存和查询成本，日期范围最长 366 天、最多处理 100,000 张
订单；若达到硬上限，响应中的 `truncated` 为 `true`。

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
