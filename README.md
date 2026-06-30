# heibai address guard

第三套独立 UI：TRON / Ethereum 地址安全检测与风险报告。

## 预览

直接打开 `index.html` 即可。

## 接口配置

复制配置模板：

```bash
cp config.example.js config.js
```

编辑 `config.js`：

```js
window.APP_CONFIG = {
  siteHost: "your-domain.com",
  endpoints: {
    scanTron: "/api/risk/tron",
    scanEthereum: "/api/risk/ethereum",
    batchScan: "/api/risk/batch",
  },
};
```

## Vercel 代理

`vercel.json` 已预留 `/api/*` 代理：

```json
{
  "source": "/api/(.*)",
  "destination": "https://backend.example.com/api/$1"
}
```

把 `backend.example.com` 替换为真实后端域名即可。

批量风险检测最多接受 20 个 TRON / Ethereum 地址。分享按钮生成“复查链接”，打开时会重新请求最新风险结果，不保存或伪造历史报告。
