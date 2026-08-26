# S1 后端接口说明

本文件是给前端和其他小组使用的接口契约。接口需要 Medusa 已登录的
`auth_context`，不要把下面的身份字段放进请求体伪造。

## 工匠档案

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/store/artisans?limit=20&offset=0` | 只返回 `approved` 档案；响应包含 `limit`、`offset`、`count`、`has_more` |
| `GET` | `/store/artisans/:id` | 只返回已审核档案 |
| `GET` | `/admin/artisan-profiles` | 管理员可查全平台；卖家自动限制为自己所属店铺/工匠 |
| `POST` | `/admin/artisan-profiles` | 创建档案；卖家不能直接创建 `approved` 档案 |
| `GET/POST/DELETE` | `/admin/artisan-profiles/:id` | 按店铺和显式 `artisan_user_id` 做归属校验 |
| `POST` | `/admin/artisan-profiles/:id/media` | 添加已有 HTTPS/HTTP 媒体 URL |
| `POST` | `/admin/artisan-profiles/:id/media/upload` | 上传 base64 图片/视频；单文件最多 10 MB，检查文件签名 |
| `DELETE` | `/admin/artisan-profiles/:id/media` | body 传 `file_id` 或 `url` 删除媒体 |

创建档案的主要字段：`store_id`、`display_name`、`bio`、`inspiration`、
`creative_process`、`avatar_url`、`location`、`specialties`、`media`。

## 定制订单

### 客户端（Store API）

`/store/custom-orders` 及其所有子路径已在 `src/api/middlewares.ts` 注册
`authenticate("customer", ["session", "bearer"])`。调用必须携带已登录客户的
Medusa session cookie 或 bearer token；publishable API key 只能识别销售渠道，
不能单独绕过客户身份验证。

`GET /store/custom-orders` 只查询当前登录客户的订单。创建时服务端从登录
身份写入 `customer_id`，请求体中的同名字段会被忽略。

```json
{
  "artisan_id": "art_xxx",
  "title": "定制外套",
  "product_category": "coat",
  "product_category_id": "pcat_custom_order",
  "listing_type": "custom_request",
  "description": "尺寸和面料要求",
  "budget_amount": 680,
  "currency_code": "cny",
  "metadata": {"size": "M"}
}
```

`budget_amount` 和 `quoted_amount` 使用整数的最小货币单位（例如人民币分），
不接受小数，以避免浮点误差。

当 `listing_type` 为 `product`，必须同时提供 `product_id`。商品必须属于提交的
`product_category_id`（如果提供）、处于 `published` 状态并有可用 variant，且
通过 `product_store` link 归属于该工匠的店铺；商品或类别还必须设置
`metadata.custom_order_enabled: true`。否则接口会拒绝跨店铺、未发布或未明确
允许定制的商品。seed 创建的 `Custom Order` 类别已带有这个标记。

`GET /store/custom-orders/:id`、`PATCH /store/custom-orders/:id` 和客户聊天
接口均要求订单属于当前客户。客户只能更新 `metadata`，不能报价或改变状态。

### 后台（Admin API）

- `GET /admin/custom-orders`：平台管理员可查全平台；卖家只看到分配给自己
  的工匠订单，查询参数中的 `customer_id` 不会扩大卖家范围。
- `GET/PATCH/POST/DELETE /admin/custom-orders/:id`：只有对应工匠或平台管理员
  可以读取和修改订单；更新订单字段和状态是一个事务。
- `GET /admin/custom-orders/:id/history`：读取状态历史。
- `GET/POST /admin/custom-orders/:id/messages`：对应工匠或平台管理员读取/发送
  消息。发送者类型和 ID 由登录身份生成。

状态只能按以下顺序推进：

`request → quote → confirmed → produced → delivered`

每个未生产阶段都可以 `→ cancelled`。进入 `quote` 必须提供正报价；进入
`confirmed` 必须已有报价；进入 `produced` 前付款状态必须为 `authorized` 或
`captured`；进入 `cancelled` 必须提供 `cancellation_reason`；进入
`delivered` 会自动写入 `delivered_at`。已交付/取消订单不能再改报价、类别或
商品关联。

所有列表接口的 `limit` 最大为 100，非法分页参数会返回 `400`，响应中的分页值
是规范化后的实际值。

## 数据库变更

- `artisan_profile` 增加 `artisan_user_id`，并为店铺、用户、审核状态建立索引。
- `custom_order_request` 增加正式商品/类别关联、付款状态、交付/取消审计字段和
  乐观锁 `version`。
- 新表 `custom_order_status_history` 记录每次状态变化的操作者、时间和原因。
- 删除订单时服务事务会先清理消息和状态历史；跨模块店铺、工匠、客户 link 已
  在 `src/links` 中注册。
- 所有模块共用一张 `mikro_orm_migrations` 表，迁移名称保持全局唯一；空库和
  已运行旧版 S1 迁移的数据库都要执行 `pnpm medusa db:migrate` 完成升级。
