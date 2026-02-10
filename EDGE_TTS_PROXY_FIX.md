# Edge TTS 代理问题解决方案

## 问题描述

在使用翻译配音功能时，Edge TTS 返回 403 错误：
```
Error: Unexpected server response: 403
```

## 根本原因

Edge TTS 使用 WebSocket 连接到微软服务器 (`speech.platform.bing.com`)，但全局代理（Clash/V2Ray）可能会拦截或阻止这个连接，导致 403 错误。

## 解决方案

### 方案 1：在代理软件中配置直连规则（推荐）

#### Clash 配置

在 Clash 配置文件中添加以下规则：

```yaml
rules:
  # Edge TTS 直连
  - DOMAIN-SUFFIX,microsoft.com,DIRECT
  - DOMAIN-SUFFIX,bing.com,DIRECT
  - DOMAIN,speech.platform.bing.com,DIRECT
```

#### V2Ray 配置

在 V2Ray 的路由规则中添加：

```json
{
  "routing": {
    "rules": [
      {
        "type": "field",
        "domain": [
          "microsoft.com",
          "bing.com",
          "speech.platform.bing.com"
        ],
        "outboundTag": "direct"
      }
    ]
  }
}
```

### 方案 2：临时关闭代理（测试用）

如果只是临时测试，可以：

1. 在 `.env` 文件中注释掉代理设置：
   ```bash
   # HTTP_PROXY=http://127.0.0.1:7897
   # HTTPS_PROXY=http://127.0.0.1:7897
   ```

2. 重启后端服务：
   ```bash
   cd backend
   npm run dev
   ```

### 方案 3：使用系统环境变量 NO_PROXY（已自动配置）

后端已经配置了 `NO_PROXY` 环境变量来绕过代理：
```bash
NO_PROXY=localhost,127.0.0.1,speech.platform.bing.com,*.microsoft.com,*.bing.com
```

但如果 Clash 开启了 TUN 模式，这个设置可能不起作用。

## 验证配置

1. 重启后端服务
2. 上传一个视频
3. 选择"翻译并配音到中文"
4. 观察后端日志，应该看到：
   ```
   [EdgeTTS] Proxy and global-agent bypassed for WebSocket connection
   [EdgeTTS] Generated audio buffer: XXXXX bytes
   ```

## 其他 TTS 选项（备选）

如果 Edge TTS 持续无法使用，可以考虑：

1. **OpenAI TTS**（需要 API key）
   - 在 `.env` 中配置 `OPENAI_API_KEY`
   - 修改代码使用 OpenAI TTS 服务

2. **本地 TTS**（如 espeak, festival）
   - 音质较差，但不需要网络连接

## 技术细节

代码中实现的代理绕过逻辑：

1. 临时删除所有代理环境变量
2. 尝试绕过 `global-agent` 的 HTTP 拦截器
3. 调用 Edge TTS API
4. 恢复代理设置

相关代码：[backend/src/services/edgeTts.ts](backend/src/services/edgeTts.ts:96-160)

## 常见问题

### Q: 为什么其他 API（OpenAI、Groq）可以用代理，但 Edge TTS 不行？
A: Edge TTS 使用 WebSocket 协议，而大多数 HTTP 代理对 WebSocket 的支持不完善，容易导致连接失败。

### Q: Clash TUN 模式下如何配置？
A: TUN 模式会在系统层面拦截所有流量，需要在 Clash 配置中添加直连规则，仅靠环境变量无法绕过。

### Q: 如何确认代理是否影响了 Edge TTS？
A: 查看后端日志，如果看到 "Unexpected server response: 403"，说明代理拦截了请求。
