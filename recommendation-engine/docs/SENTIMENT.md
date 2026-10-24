# S4 情感分析层（Week 10）

> 对应项目计划第 10 周：*"S4 contributes a simple sentiment analysis layer over the
> existing product review data."* 卖家分析面板中的「评论情感摘要」由本层产出。

## 1. 目标与边界

- **S4 提供**：对商品评论的离线情感分析，产出聚合摘要（正面/中性/负面计数、比例、
  平均极性、平均星级、高频正负关键词）。
- **S1 负责**：在 analytics 聚合接口中读取该摘要并返回给后台。
- **S2 负责**：在卖家分析面板中展示。
- **S4 不负责**：前端展示、写库、修改评论数据。

## 2. 数据来源

评论来自平台已有的 product review 数据（Medusa 插件
`@lambdacurry/medusa-product-reviews`）。本层与推荐引擎一样采用
**schema 自省 + 列同义词匹配**定位评论表，不硬编码表名：

| 用途 | 可接受的列名 |
| --- | --- |
| 商品列（必需） | `product_id` / `item_id` |
| 评分列（可选） | `rating` / `score` / `stars` |
| 文本列（可选） | `content` / `comment` / `body` / `text` / `message` |
| 标题列（可选） | `title` / `subject` / `headline` |
| 状态列（可选） | `status`（自动排除 `rejected` / `spam`） |

商品列必须存在，且至少要有评分列或文本列之一。表名优先 `review` /
`product_review`。

## 3. 情感算法（简单、可解释、零依赖）

- **词典法**：内置中英文正/负词表（带权重，如 `一般` 权重 0.5）。
- **否定翻转**：词前 8 个字符内出现 `not/no/never/不/没/没有/无/别/未` 等 → 极性反转。
- **程度加强**：`very/really/extremely/太/很/非常/特别` 等 → 按权重放大。
- **评分融合**：若评论有 1–5 星评分，归一化为 -1..1，与文本分数按
  `0.6 × 文本 + 0.4 × 评分` 融合；纯评分评论直接使用评分。
- **判定阈值**：`score > 0.15` 正面；`< -0.15` 负面；其余中性。
- **依赖**：仅标准库（`math` / `re` / `collections`），不引入第三方库。

## 4. 输出

默认写入 `artifacts/sentiment.json`：

```json
{
 "generated_at": "2026-10-22T00:00:00Z",
 "model_version": "sentiment-v1",
 "overall": {
   "total": 120, "positive": 70, "neutral": 30, "negative": 20,
   "positive_ratio": 0.5833, "negative_ratio": 0.1667,
   "average_score": 0.4123, "average_rating": 4.1,
   "top_positive_terms": [["质量", 18], ["漂亮", 12]],
   "top_negative_terms": [["破损", 6], ["慢", 3]]
 },
 "by_product": {
   "prod_xxx": { "...同上..." }
 },
 "by_store": {
   "store_xxx": { "...同上..." }
 }
}
```

**隐私**：只输出聚合统计；不输出评论原文、客户 ID 或其他身份信息。

## 5. 运行

```bash
cd recommendation-engine
export DATABASE_URL="postgresql://..."      # 或 sqlite:///simulated_marketplace.db

python -m recommender.sentiment --inspect     # 只打印评论表定位
python -m recommender.sentiment --export artifacts/sentiment.json
python -m recommender.sentiment --limit 5000  # 限制读取条数
```

> 若真实库暂时没有 review 数据，可先用含有 `review` 表的 SQLite 库验证。

## 6. 与 S1/S2 的契约

S1 的 analytics 接口可直接读取 `artifacts/sentiment.json`（与推荐 artifact 同样的
离线交付模式），按三种维度透出：

| 维度 | 键 | 用途 |
| --- | --- | --- |
| 全站 | `overall` | 平台级评论情感概览 |
| 商品 | `by_product[product_id]` | 商品详情 / 分析页 |
| 店铺 | `by_store[store_id]` | **卖家分析面板（按 vendor 隔离）** |

`by_store` 由 product 表的 `store_id` / `seller_id` / `vendor_id` 映射得到；
若 product 表没有该列，`by_store` 为 `{}`（结构稳定，S1 可直接判空）。

字段建议冻结：`total` / `positive` / `neutral` / `negative` / `positive_ratio` /
`negative_ratio` / `average_score` / `average_rating` /
`top_positive_terms` / `top_negative_terms`。

### REST API 端点（可选交付方式）

除读文件外，S1 也可以直接调用 S4 服务（与推荐端点共用同一套鉴权与降级策略）：

```http
GET /sentiment?product_id=<id>&store_id=<id>
X-API-Key: <RECOMMENDATIONS_API_KEY>
```

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `product_id` | 否 | 命中 `by_product[product_id]`（最具体，优先） |
| `store_id` | 否 | 命中 `by_store[store_id]` |
| （都不传） | – | 返回 `overall` |

返回结构：

```json
{
  "summary": { "total": 10, "positive": 6, "neutral": 2, "negative": 2, "...": "..." },
  "dimension": "product | store | overall | unavailable",
  "context": { "product_id": "...", "store_id": "..." },
  "model_version": "sentiment-v1",
  "generated_at": "2026-10-23T00:00:00Z",
  "source": "unavailable | <artifact source>"
}
```

行为约定：

- **鉴权**：缺少/错误的 `X-API-Key` → 401；服务端未配置 `RECOMMENDATIONS_API_KEY` → 503。
- **降级**：`artifacts/sentiment.json` 缺失或损坏 → `dimension="unavailable"`、`summary=null`，不崩溃。
- **未知 id**：回退到 `overall`（与推荐端点的回退思路一致）。
- **参数校验**：id 需匹配 `^[a-zA-Z0-9_-]{1,128}$`，否则 422。
- **缓存**：`Cache-Control: private, no-store`。
- **配置**：报告路径可用 `SENTIMENT_PATH` 覆盖（默认 `artifacts/sentiment.json`）。

### 真实库验证步骤

```bash
export DATABASE_URL="postgresql://..."       # Railway 平台库
python -m recommender.sentiment --inspect
```

输出应包含：

- `review table -> ...` 以及实际列名（确认评分/文本列是否被识别）；
- `product->store mapping: N products (by_store enabled)`；
  若显示 `unavailable`，说明 product 表没有 store/seller 列，`by_store` 会为空。

确认无误后再导出：

```bash
python -m recommender.sentiment --export artifacts/sentiment.json
```

## 7. 限制

- 词典法对反讽与复杂长句识别有限，定位是「简单情感层」，不追求 SOTA。
- 没有评论文本、只有评分的评论按评分判定，准确性依赖评分本身。
- 关键词统计会包含命中的词典词（属于聚合结果），但不包含任何原文。
