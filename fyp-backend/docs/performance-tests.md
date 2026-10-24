# 卖家分析性能验收(S5)

> 对应第 10 周任务:*"S5 writes performance tests to ensure analytics queries do
> not degrade storefront response times."* 本文档说明压测工具的用法、判定标准
> 与注意事项。

## 目的与范围

卖家仪表盘的聚合查询(`/admin/analytics/sales`、`/admin/analytics/custom-orders`)
与顾客商城共用同一数据库。本工具在同一台后端上依次完成三个阶段的测量,
验证"仪表盘在被人使用时,顾客侧接口的延迟不发生明显劣化":

1. **baseline(基线)**:只压顾客侧接口(`GET /store/products` 列表与详情),
   记录 p95 等指标;
2. **analytics(参考)**:只压分析端点,了解聚合查询自身的耗时(不计入判定);
3. **mixed(混合)**:在后台持续制造分析端点负载的同时,重新测量同一批顾客侧
   接口。

**判定标准**:混合阶段每个顾客侧接口的 p95 相对基线的劣化幅度不超过阈值
(默认 10%),且混合阶段无请求错误。全部通过则脚本退出码为 0,可直接接入
CI 或验收流程。

压测在 HTTP API 层进行,不经过 Next.js 店面进程——店面的响应时间由后端
数据接口延迟主导,这是任务关注的瓶颈所在。

## 前置条件

1. **后端运行中**(默认 `http://localhost:9000`),数据库可用
   (`.env` 中 `DATABASE_URL` 指向的云库)。
2. **发布密钥(publishable key)**:按以下顺序自动解析——
   环境变量 `PERF_PUBLISHABLE_KEY` → `fyp-storefront/.env` 中的
   `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` → 通过 `DATABASE_URL` 查询 `api_key`
   表(只读)。若都没有,执行
   `pnpm medusa exec src/scripts/ensure-publishable-key.ts` 后重试。
3. **管理员账号**(压测 admin 端点必需;`--skip-admin` 可跳过):为压测创建
   专用账号,不要复用个人账号:

   ```bash
   # 在 fyp-backend/ 下执行;会写入 .env 所指数据库
   npx medusa user --email perf@example.com --password <强密码>

   # 将该账号提升为平台管理员(仅改这一个新账号):
   # UPDATE "user" SET metadata = '{"is_super_admin":true}'::jsonb
   #   WHERE email = 'perf@example.com';
   ```

   > 说明:普通后台账号若未关联任何店铺,分析接口会直接返回空结果,
   > 压不出真实的聚合查询,因此压测账号必须是平台管理员。
   > 验收完成后可删除该账号:`DELETE FROM "user" WHERE email = 'perf@example.com';`

## 用法

```bash
cd fyp-backend

# 完整三阶段(推荐)
PERF_ADMIN_EMAIL=perf@example.com \
PERF_ADMIN_PASSWORD=<强密码> \
pnpm perf -- --out perf-results/report.json

# 仅测顾客侧基线(不需要管理员账号,适合快速冒烟)
pnpm perf -- --skip-admin
```

常用参数:

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `--base-url` | `http://localhost:9000` | 后端地址 |
| `--duration` | `20` | 每个测量阶段的秒数 |
| `--store-connections` | `10` | 顾客侧接口并发连接数 |
| `--analytics-connections` | `5` | 分析端点并发连接数(模拟多个卖家同时看板) |
| `--threshold` | `0.1` | p95 劣化阈值(0.1 = 10%) |
| `--analytics-include` | 全部 | 只压名称包含给定子串的分析端点(逗号分隔),如 `custom-orders` |
| `--warmup` | `3` | 每个阶段前的预热请求数 |
| `--out` | 不写文件 | 结果 JSON 输出路径 |
| `--skip-admin` | 关 | 只测顾客侧,不登录管理员 |

压测覆盖的分析端点:近 90 天与近 30 天的销售聚合、近 90 天的定制订单聚合
(币种 cny)。顾客侧接口:`GET /store/products?limit=12` 与首个商品详情。

## 结果解读

```
Phase 1/3 — baseline (store endpoints alone):
  GET /store/products (list, limit=12)   p95     12.4 ms   ...
Phase 3/3 — mixed (store measured while analytics load runs):
  GET /store/products (list, limit=12)   p95     13.1 ms   ...
Store p95 degradation under analytics load (threshold 10.0%):
  [PASS] GET /store/products (list, limit=12): p95 12.4 -> 13.1 ms (5.6%)
Verdict: PASS — analytics queries did not degrade storefront latency beyond the threshold.
```

- **PASS**:分析查询负载下,顾客侧 p95 劣化在阈值内。
- **FAIL**:劣化超阈值,或测量不完整(如基线阶段无数据)。先检查数据库
  连接与数据规模,再考虑加索引或调低并发重试。
- **BLOCKED**:分析端点在压测中返回了错误(如 HTTP 500)。此时后台负载是
  "快速失败"而非真实聚合计算,混合阶段的对比不具代表性——先修复端点再
  重跑,不要把这种 FAIL 当成性能结论。
- `analytics endpoints alone` 阶段的 p95 反映聚合查询自身耗时,数值大说明
  查询本身重(与店面是否被拖慢无关,仅作参考)。

## 首轮验收记录(2026-10-24,dev 模式 + Railway 云库)

- `GET /admin/analytics/sales` 对平台管理员账号**稳定返回 HTTP 500**:
  `query.graph` 中点链式通配字段(如 `*items.variant.product`、
  `*payment_collections.payments.captures`)在当前 MikroORM(6.4.16)的
  populate 解析中崩溃(`Cannot read properties of undefined (reading 'kind')`)。
  逐字段二分已确认;一级展开(`*items`、`*payment_collections`)正常,
  但改用无星点路径会覆盖通配展开、丢失标量字段,不能简单替换。
  **待 S1 修复后重跑**;该 bug 与性能验收 PR 一并记录,复现方式见 PR 描述。
- 在 sales 不可用的情况下,仅 `custom-orders` 聚合作为后台负载的压力测试
  (全部请求 2xx、零错误,数字可信)显示:10 并发顾客侧请求的 p95 从
  152.2ms 升至 314.9ms(列表,+107%)、68.3ms 升至 159.2ms(详情,+133%)。
  注意这是**压力档**负载(每个分析端点 5 条闭环连接满速刷新,远超真实
  卖家使用强度),结论是"高压下无余量",不是"正常使用即拖慢店面";
  数据量增大、以及 S1 接入情感摘要后,都需要重跑确认。可向 S1 反馈的
  优化方向:每请求的查询次数、数据库连接池大小、聚合字段的索引。
- 以上为 dev 模式数字(远程 Railway 库,单请求延迟含网络 RTT),仅用于
  定位问题量级;里程碑验收请用生产构建重跑。

### 复跑记录(2026-10-25,sales 修复后)

- sales 路由字段修复(PR #24)合入前已在本地验证:三个分析端点全部
  2xx,BLOCKED 判定解除,完整压测可出真实数字。
- 修复后的完整压测(dev 模式):`sales` 聚合单独压测 p95 约
  284–295ms——比 `custom-orders`(约 33–43ms)重一个数量级,因为它要
  深层展开行项目、变体、商品与支付 capture/refund。混合阶段店面 p95
  劣化 +204%(列表)/ +135%(详情),与修复前的归因结果一致:
  **压力档下无余量**的结论稳定成立。
- S1 的优化方向按影响排序:sales 聚合的每请求查询量(当前每页 1000 单
  全量展开)、DB 连接池与索引、聚合字段精简。S1 接入情感摘要后需再跑
  一轮;里程碑验收请用生产构建出正式数字。

## 注意事项

- **压的是真实库**:`pnpm perf` 会对 `.env` 所指数据库产生真实只读查询压力。
  请避开团队共享库的使用高峰;脚本本身只发 GET 请求,不写任何业务数据。
- **数据规模**:当前共享库订单量很小,测得的劣化幅度偏乐观。等真实订单
  数据积累后、以及 S1 把评论情感摘要接进聚合接口之后,都需要**重跑一轮**
  并把报告存档到 `perf-results/`(该目录已加入 `.gitignore`,不入库)。
- **dev 模式 vs 生产构建**:开发模式(`pnpm dev`)下的绝对耗时偏高;
  作为里程碑验收,建议用生产构建(`pnpm build && pnpm start`)出的数字存档。
- **发布密钥与管理员密码不要提交**到仓库;结果 JSON 中也不含凭据。
