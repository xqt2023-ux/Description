# Clash 配置指南 - 解决 Edge TTS 403 错误

## 问题确认

从日志可以看到：
```
[EdgeTTS] Proxy temporarily disabled for WebSocket connection
[stderr] [EdgeTTS] Error: Error: Unexpected server response: 403
```

这说明 Clash 的 TUN 模式在系统层面拦截了 Edge TTS 的 WebSocket 连接。

## 解决方案：在 Clash 中添加直连规则

### 步骤 1: 找到 Clash 配置文件

Clash 的配置文件通常位于：

**Windows:**
- Clash for Windows: `%USERPROFILE%\.config\clash\profiles\`
- 或者在 Clash 界面中点击 "Profiles" -> 当前配置文件 -> "Edit"

**常见文件名:**
- `config.yaml`
- `subscription.yaml`
- 或者以日期命名的配置文件

### 步骤 2: 编辑配置文件

在配置文件中找到 `rules:` 部分，在最前面（注意：规则顺序很重要！）添加以下规则：

```yaml
rules:
  # ========== Edge TTS 直连规则 ==========
  # 必须放在最前面，优先级最高
  - DOMAIN-SUFFIX,microsoft.com,DIRECT
  - DOMAIN-SUFFIX,bing.com,DIRECT
  - DOMAIN,speech.platform.bing.com,DIRECT
  - DOMAIN-KEYWORD,speech.platform,DIRECT

  # ... 其他规则保持不变 ...
  - MATCH,Proxy  # 默认代理规则（保持原样）
```

### 步骤 3: 保存并重新加载配置

1. 保存配置文件
2. 在 Clash 界面中点击 "Reload" 或 "Restart"
3. 等待配置重新加载完成

### 步骤 4: 验证配置

#### 方法 1: 使用 Clash 的 Connections 查看

1. 在 Clash 界面打开 "Connections" 或 "实时连接"
2. 在浏览器中测试配音功能
3. 观察连接列表，`speech.platform.bing.com` 应该显示为 "DIRECT"

#### 方法 2: 查看后端日志

成功时应该看到：
```
[EdgeTTS] Generated audio buffer: XXXXX bytes
```

而不是：
```
Error: Unexpected server response: 403
```

## 完整配置示例

```yaml
# Clash 配置示例（仅显示关键部分）

port: 7890
socks-port: 7891
allow-lan: false
mode: Rule
log-level: info

dns:
  enable: true
  listen: 0.0.0.0:53
  nameserver:
    - 223.5.5.5
    - 114.114.114.114

proxies:
  # ... 你的代理配置 ...

proxy-groups:
  # ... 你的代理组配置 ...

rules:
  # ========== Edge TTS 直连规则（必须在最前面）==========
  - DOMAIN-SUFFIX,microsoft.com,DIRECT
  - DOMAIN-SUFFIX,bing.com,DIRECT
  - DOMAIN,speech.platform.bing.com,DIRECT
  - DOMAIN-KEYWORD,speech.platform,DIRECT

  # ========== 其他直连规则 ==========
  - DOMAIN-SUFFIX,cn,DIRECT
  - GEOIP,CN,DIRECT

  # ========== 默认代理 ==========
  - MATCH,Proxy
```

## 常见问题

### Q: 我找不到配置文件怎么办？

**方法 1: 在 Clash 界面中直接编辑**
1. 打开 Clash for Windows
2. 点击 "Profiles"
3. 找到当前激活的配置文件（绿色高亮）
4. 点击右侧的 "Edit" 图标（铅笔图标）
5. 直接在打开的编辑器中修改

**方法 2: 使用自定义规则集**
在 Clash for Windows 的 "Settings" -> "Profile Mixin" 中添加：
```yaml
mixin:
  rules:
    prepend:
      - DOMAIN-SUFFIX,microsoft.com,DIRECT
      - DOMAIN-SUFFIX,bing.com,DIRECT
      - DOMAIN,speech.platform.bing.com,DIRECT
```

### Q: 添加规则后还是 403 错误？

检查以下几点：
1. **规则顺序**: Edge TTS 规则必须在其他规则之前
2. **重新加载**: 确保 Clash 已经重新加载配置
3. **清除缓存**: 重启后端服务
   ```bash
   # 停止后端
   # 然后重新启动
   cd backend
   npm run dev
   ```

### Q: 我用的是 TUN 模式，规则会生效吗？

会生效！TUN 模式下，Clash 会先检查规则再决定是否代理。添加 DIRECT 规则后，匹配的域名会直连，不经过代理。

### Q: 我不想改 Clash 配置，有其他方案吗？

可以临时关闭 Clash，或者在 `.env` 中注释掉代理设置：

```bash
# 编辑 backend/.env
# HTTP_PROXY=http://127.0.0.1:7897
# HTTPS_PROXY=http://127.0.0.1:7897

# 或者设置 NO_PROXY（TUN 模式下可能无效）
NO_PROXY=*
```

但这样会导致其他需要代理的 API（如 OpenAI）也无法使用。

## 测试步骤

配置好 Clash 后，按以下步骤测试：

1. **重新加载 Clash 配置**
   - 在 Clash 界面点击 "Reload" 或 "Restart"

2. **清空后端缓存并重启**
   ```bash
   cd backend
   # 停止当前运行的后端（Ctrl+C）
   npm run dev
   ```

3. **在浏览器中测试**
   - 打开 http://localhost:3000
   - 上传一个视频
   - 选择"翻译并配音到中文"
   - 观察进度

4. **查看后端日志**
   应该看到：
   ```
   [EdgeTTS] Generating audio with voice: zh-CN-XiaoxiaoNeural
   [EdgeTTS] Generated audio buffer: XXXXX bytes
   ```

## 进一步帮助

如果按照以上步骤操作后仍然无法解决：

1. 检查 Clash 版本（建议使用最新版本）
2. 尝试切换到规则模式（Rule Mode）而不是全局模式
3. 查看 Clash 日志，确认规则是否被正确应用
4. 考虑使用其他 TTS 服务（如 OpenAI TTS）作为备选

## 相关文档

- [Clash 规则配置文档](https://github.com/Dreamacro/clash/wiki/configuration)
- [Edge TTS GitHub](https://github.com/rany2/edge-tts)
- 项目代理配置说明: [EDGE_TTS_PROXY_FIX.md](./EDGE_TTS_PROXY_FIX.md)
