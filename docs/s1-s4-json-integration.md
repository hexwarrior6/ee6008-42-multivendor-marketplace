# S1 推荐 API 与 S4 JSON 对接

更新日期：2026-10-11。S1 通过 `GET /store/recommendations` 提供 S4 离线训练后的推荐结果。

## 交付与配置

S4 使用现有训练入口导出 `recommendations.json`；S1 只需读取该文件，不要求后端安装 Python。模型训练与评估由 S4 维护。当前适配基于推荐分支提交 `83c7c4ab92eb0422da90531467918f1fed3d17b9` 的导出契约。

后端进程配置：

```powershell
$env:RECOMMENDATIONS_FILE = 'C:\exports\recommendations.json'
$env:RECOMMENDATIONS_MAX_AGE_SECONDS = '86400'
pnpm dev
```

路径由管理员配置，不能由 HTTP 查询参数指定。相对路径以启动后端时的工作目录为基准，建议使用绝对路径。文件应仅供后端读取，其中包含客户 ID 映射，不应放进前端 public 目录或公开 Git 仓库。

有效期默认一天，可配置 60–2592000 秒。JSON 上限 8 MiB；每个用户/商品的列表及 fallback 最多 200 项。S4 的 `--k 8` 默认导出满足该限制。更新结果时先输出到新文件，完成后原子替换正式文件，避免读取半写入结果。后端每次请求读取当前文件，不需要重启来刷新结果。

本轮仅增加 `.env.template` 配置，没有把模拟训练产物配置为实际商城数据源。

## 固定契约

```json
{
  "source": "als",
  "model_version": "reco-v1-20261011-1200",
  "generated_at": "2026-10-11T12:00:00Z",
  "by_user": { "cus_xxx": [{ "product_id": "prod_a", "score": 0.93, "reason": null }] },
  "by_product": { "prod_b": [{ "product_id": "prod_a", "score": 0.71 }] },
  "fallback": [{ "product_id": "prod_a", "score": 1 }]
}
```

`source` 支持 S4 当前的 `svd`、`als`、`lightfm`、`content`。`by_product` 和 fallback 可能由内容/热门算法产生；source 沿用导出文件的模型来源，具体命中分支通过 `strategy` 区分。允许有限的负数模型分数、可选或 null 的 reason；导出时的标题、handle、图片不直接用于展示。

## 请求与响应

请求需要有效 publishable key。登录客户通过 session/bearer 身份取得自己的用户推荐，不必传 customer_id；若传入 customer_id，必须与登录身份一致。

选择顺序是 `by_user[登录客户]` → `by_product[product_id]` → `fallback`。某一级为空，或过滤后没有可见商品，则尝试下一级。每一级按模型给出的顺序去重、排除当前商品，再限制返回数量。limit 默认 8，允许 1–24。

后端重新查询每个候选商品的销售渠道、发布状态和变体，只返回当前 publishable key 渠道可见的商品。标题、handle 和图片使用数据库当前值。返回单个选定列表，不返回其他用户映射或整个导出文件。

响应保留 recommendations/count/limit/source/model_version/context，模型结果另带 generated_at、strategy 和 personalized。只有命中 by_user 时 personalized 为 true。所有推荐响应设置 `Cache-Control: private, no-store`，避免共享缓存泄露用户推荐。

文件未配置、不可读、契约错误、超限、时间异常或过期时回退到原有规则推荐，并返回 `source: rules`、`strategy: rules`、`personalized: false` 和 fallback_reason。所有模型列表过滤后均不可用时，fallback_reason 为 no_visible_results。错误响应不暴露文件路径或文件内容。

## 联调复现

先在含 S4 源码的独立目录中执行 `python scripts/run_checks.py`。使用后端隔离 HTTP 测试时，提供：

```powershell
$env:FEATURE_S4_ROOT = 'C:\path\to\recommendation-engine'
$env:FEATURE_S4_PYTHON = 'C:\path\to\python.exe'
# 显式配置独立 PostgreSQL 测试服务器的 TEST_DATABASE_URL。
pnpm test:feature:http
```

测试会创建唯一临时数据库、生成对应测试商品 ID 的离线 CSV，直接调用 S4 原始 SVD/ALS 训练入口生成 JSON，然后通过实际 Medusa HTTP 接口验证用户推荐、相似商品、fallback、渠道隔离、身份防伪造、最新标题、过期/损坏降级及文件恢复。支付只启用 mock。测试结束清理本轮临时库及临时训练文件。

未提供 FEATURE_S4_ROOT/FEATURE_S4_PYTHON 时，该跨语言场景明确 skip，其他 HTTP 场景照常运行；不能把跳过的场景称为 S4 联调通过。

## 本轮验证结果（2026-10-11）

- S4 原始源码独立副本（提交 `83c7c4ab92eb0422da90531467918f1fed3d17b9`）：自检运行 71 项，2 项因未安装可选 LightFM 跳过，其余通过；离线流水线 smoke 通过。
- 后端单元测试：40 组、348 项全部通过；`pnpm exec tsc --noEmit` 通过。
- 隔离 HTTP 集成测试：14 项全部通过，无跳过；其中跨语言场景实际调用 S4 训练并导出 JSON，再经 Medusa HTTP 验证，不是手写模型响应替身。
- 本轮及先前中断运行遗留的临时数据库已清理，并经只读查询确认不存在；正式 `.env` 未修改，未推送 GitHub。

测试日志中出现前台 `localhost:8080` 不可达的商品事件通知错误；本轮未启动前台，因此未验收该通知链路，不影响上述推荐 HTTP 断言通过。

## 验收范围

本地联调使用模拟交互数据验证 S4 导出与 S1 API 的真实代码兼容性。线上启用仍需 S4 交付基于实际商品和客户 ID 的有效产物，并在部署环境配置可读路径和刷新安排。真实数据推荐效果、独立 REST 模型服务部署及前台新组件合并由相应负责人另行验收。
