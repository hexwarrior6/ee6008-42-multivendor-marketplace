# S1–S4 推荐 REST API 对接

更新日期：2026-10-19。当前后端支持直接调用 S4 已部署服务，不再需要各组员配置本机 JSON 文件路径。

## 配置与调用

后端 `.env`（或后端部署平台的环境变量）配置：

```dotenv
RECOMMENDATIONS_API_URL=https://recommendation-api-development.up.railway.app
RECOMMENDATIONS_API_KEY=由S4私下提供的密钥
RECOMMENDATIONS_API_TIMEOUT_MS=1500
RECOMMENDATIONS_MAX_AGE_SECONDS=86400
```

密钥仅保存在后端，不能放到 `NEXT_PUBLIC_*`、URL 参数、前台代码或 GitHub。修改环境变量后重启对应后端；本地 `.env` 不会自动同步到其他组员电脑或 Railway 后端。

接口文档：[Swagger](https://recommendation-api-development.up.railway.app/docs)。已核对 OpenAPI：`GET /recommendations`，鉴权头为 `X-API-Key`，参数为可选 `customer_id`、`product_id` 和 `limit`（1–24）。`GET /health` 用于独立检查存活和模型加载状态，不在每次商城请求中额外调用。

前台仍只调用 Medusa 的 `GET /store/recommendations`，携带 publishable key 和已有登录凭据，无需获取 S4 密钥或修改路径。Medusa 从认证上下文取客户 ID，拒绝冒用其他客户；商品上下文先验证渠道可见性，再请求 S4。匿名请求不发送客户身份。

## 安全与降级

- API URL 已配置时优先使用 REST；最多请求 24 个候选，以便在本地过滤后仍保留结果，最终按前台 limit 返回。
- 服务端采用 `X-API-Key`，不转发浏览器请求头；禁止重定向携带密钥，要求 HTTPS（本机回归可用 loopback HTTP）。
- 总超时默认 1500 ms，给现有前台 3000 ms 请求期限留出数据库过滤与规则降级时间；允许 100–10000 ms，部署时应小于前台超时。JSON 响应最多 256 KiB，验证产品 ID、有限数值分数、策略、个性化标记、版本和时间；兼容 S4 无候选时返回的 `strategy: empty`，随后使用本地规则降级。旧模型有效期沿用 86400 秒，可设 60–2592000 秒，过期结果不冒充有效模型。
- 模型仅提供候选 ID/分数；Medusa 再查销售渠道、发布状态及变体，用当前数据库标题、链接和图片返回。响应 `Cache-Control: private, no-store`，不返回上游 context、密钥或整份导出映射。
- API 异常时使用原有规则推荐，不偷偷读取可能过时的本地 JSON。原因码包括 `api_not_configured`（URL 已配但密钥缺失）、`api_invalid`、`api_timeout`、`api_unavailable`、`expired`、`no_visible_results`。
- 仅在 `RECOMMENDATIONS_API_URL` 为空时保留旧 `RECOMMENDATIONS_FILE` 兼容；不配置模型时仍可使用规则推荐。历史 JSON 流程见 [原对接说明](s1-s4-json-integration.md)。

成功采用远程结果时，响应增加 `transport: api`；`source` 仍表示 `content/svd/als/lightfm`，不能用 HTTP 200 或 transport 判断是否真正个性化。`strategy: by_user` 才表示命中用户推荐。

## 验证范围

本轮已只读确认部署服务 `/health` 与鉴权匿名 `/recommendations` 均为 200；新增客户端实测读取到 `content`、版本 `reco-v1-20261018-1459`、8 个候选。健康信息显示当前 `by_user: 0`、`by_product: 1`，所以部署可达不代表个性化训练覆盖已完成。

最终验证：41 组、399 项后端单元测试，16 项隔离 HTTP 测试及 `pnpm exec tsc --noEmit` 全部通过，无跳过。覆盖 REST 客户端鉴权、超时、异常/超限/损坏数据、空策略降级、旧 JSON 兼容，以及本地真实 HTTP 替身 → Medusa → 隔离数据库的全链路用例。隔离运行器清空正式 API 地址与密钥，防止向真实服务发送测试客户 ID；保留此前 S4 离线训练导出联调用例。临时测试库已清理。

线上实测范围是新客户端到实际 S4 API 的匿名只读调用；未对部署中的 Medusa 发布新代码或执行生产用户全链路测试。测试中未启动前台，已有商品事件通知出现 `localhost:8080` 不可达日志，该通知链路不在此次验收范围。

本轮不发布后端、不修改 S4 模型源码、不触发真实支付；要让已部署的 Medusa 生效，仍需部署本次后端代码并配置上述环境变量。
