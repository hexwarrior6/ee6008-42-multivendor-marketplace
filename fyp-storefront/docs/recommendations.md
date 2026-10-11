# Week 8 S2 推荐组件对接

首页和商品详情页已准备好“猜你喜欢”组件，复用现有 ProductPreview、商品图片和地区价格。当前 S1 的端点返回 `model_pending` 和空数组，因此正常运行时推荐区块会自动收起；S1 接入 S4 结果后，有可用商品时即显示，不需要再改页面。

## 接口与展示

- 请求：`GET /store/recommendations?product_id=prod_xxx&customer_id=cus_xxx&limit=4`。
- 首页不传 `product_id`；登录客户的 `customer_id` 由服务端查询当前登录身份取得，匿名访问不传。
- 读取 `recommendations[].product_id`，保留接口排序，去除重复项和详情页当前商品。
- 再调用 Store 商品接口获取当前标题、图片、handle 和当前 region 的价格；模型中的旧标题、缩略图和分数不直接用于商品卡片。
- 不存在、不可访问或缺少 handle 的商品不展示。无推荐数据或接口失败时隐藏整个区块，已有相关商品和主要页面正常显示。
- 用 Suspense 骨架表示加载；单次远端请求设置 3 秒超时；个性化数据使用 `no-store`。
- 支持中文、英文，切换语言保留地区和商品 URL。默认四张卡片，手机两列、较宽屏幕三列或四列。

## 验证

在 `fyp-storefront` 中运行：

```powershell
pnpm test:recommendations
pnpm test:s2-localization
```

推荐测试覆盖匿名请求、服务端客户身份、过期登录、排序和去重、地区价格查询、不可用商品、空数据、服务异常、limit 限制及双语组件渲染。

## S1 尚未返回结果时的本地预览

此预览工具只用于 UI 测试，用现有商城商品生成样例推荐，不代表模型结果，不会写数据库。

先启动真实 Medusa 后端 `http://localhost:9000`，在一个前端目录终端运行：

```powershell
node scripts/preview-recommendations.js
```

在另一个前端目录终端启动页面；此设置只影响当前终端，不需要修改 `.env.local`：

```powershell
$env:MEDUSA_BACKEND_URL = "http://127.0.0.1:9101"
pnpm dev
```

打开 `/cn` 首页和任意已发布商品详情页，检查推荐区块、商品链接及语言切换。预览模式可在浏览器中切换后刷新页面：

- 有商品：`http://127.0.0.1:9101/__preview/recommendations?mode=products`
- 空结果：`http://127.0.0.1:9101/__preview/recommendations?mode=empty`
- 服务异常：`http://127.0.0.1:9101/__preview/recommendations?mode=error`

退出预览：停止两个预览进程，执行 `Remove-Item Env:MEDUSA_BACKEND_URL -ErrorAction SilentlyContinue` 后重新启动普通前端。`9101` 代理仅监听本机且仅转发读取请求，不应部署到 Railway。若端口已占用，可通过 `RECOMMENDATION_PREVIEW_PORT` 指定空闲端口。

## 协作边界

S2 本次提供推荐数据读取和 UI。`by_user` / `by_product` 命中以及 `fallback` 回退由 S1 在后端处理；训练、评估和 JSON 导出由 S4 维护。S2 不负责声明模型已在真实平台数据上完成评估。
