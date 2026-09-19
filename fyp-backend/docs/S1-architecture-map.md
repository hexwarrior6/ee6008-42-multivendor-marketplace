# S1 后端架构与扩展点

本文档记录 S1 在 Medusa.JS 后端中新增的模块、迁移和 API 扩展点，供其他成员联调时查阅。

## 1. Medusa 模块结构

```text
fyp-backend/
├─ medusa-config.ts                 # 注册本地模块和 HTTP 配置
├─ src/modules/
│  ├─ artisan-profile/
│  │  ├─ models/artisan-profile.ts  # 工匠档案模型
│  │  ├─ service.ts                 # ArtisanProfileService
│  │  └─ migrations/                # artisan_profile 表及字段迁移
│  └─ custom-order/
│     ├─ models/custom-order-request.ts
│     ├─ service.ts                 # CustomOrderService
│     ├─ state-machine.ts           # 定制订单状态和允许的转换
│     └─ migrations/                # custom_order_request/message 迁移
├─ src/api/
│  ├─ admin/artisan-profiles/        # 管理员档案 CRUD 和媒体接口
│  ├─ admin/custom-orders/           # 管理员定制订单列表、详情、状态更新
│  ├─ admin/analytics/sales/         # 销售数据汇总
│  └─ store/                         # 前台读取档案、订单和推荐契约
└─ src/workflows/
   └─ update-custom-order-status/    # 状态更新及补偿逻辑
```

`medusa-config.ts` 中的 `artisan-profile` 和 `custom-order` 模块由 Medusa 自动加载；模块下的
`models` 负责表结构，`service.ts` 由 `MedusaService` 生成标准 CRUD 能力，API 路由通过
`req.scope.resolve(...)` 获取模块服务。

## 2. 工匠档案扩展点

- 数据字段：`bio`、`inspiration`、`creative_process`、`media`。
- 管理端：`/admin/artisan-profiles` 和 `/admin/artisan-profiles/:id`。
- 前台读取：`/store/artisans` 和 `/store/artisans/:id`，仅返回已审核档案。
- 媒体：`POST /admin/artisan-profiles/:id/media` 追加 `{type, url, caption}`；
  `POST /admin/artisan-profiles/:id/media/upload` 接收 base64 图片/视频并交给 Medusa file provider，
  单个文件上限 10 MB。默认使用本地 provider；设置 `MINIO_ENABLED=true` 且配置完整 MinIO
  环境变量后切换到 MinIO。

## 3. 定制订单扩展点

- 数据表：`custom_order_request` 保存客户、工匠、预算、报价、类别和状态；
  `custom_order_message` 保存订单消息。
- 类别：`product_category` 是定制请求上的可筛选字符串字段，默认值为 `custom`。
- 状态：`request` → `quote` → `confirmed` → `produced` → `delivered`；
  `request`、`quote`、`confirmed` 可转为 `cancelled`。
- 状态变更必须经过 `src/workflows/update-custom-order-status`，失败时会执行补偿恢复原状态。
- 管理端列表支持 `artisan_id`、`customer_id`、`status`、`product_category`、`limit`、`offset`。

## 4. S4/S2 对接边界

- 推荐：`GET /store/recommendations` 的返回结构已固定；当前 `source=model_pending`，S4 提供
  模型服务后只需替换路由内部的数据来源。
- 分析：`GET /admin/analytics/sales` 汇总订单收入、订单数、客单价、热销商品和日趋势，支持
  `from`、`to`、`currency_code` 和可选 `store_id` 筛选。
- S2/S3/S4 不需要直接访问数据库表；应通过上述 API 契约接入。

## 5. 迁移顺序

启动后端前执行：

```powershell
pnpm exec medusa db:migrate
```

迁移按文件时间戳执行。新环境先创建 `artisan_profile`、`custom_order_request`、
`custom_order_message`，再添加 `inspiration`、`creative_process`、`media` 和
`product_category` 字段。
