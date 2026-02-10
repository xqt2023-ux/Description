# 文件下载指南

本文档说明翻译和配音工作流中生成的所有文件的位置和下载方式。

## 📁 文件存储位置

### 1. TTS 音频文件 (中间产物)

**本地路径：**
```
backend/uploads/audio/tts-{uuid}.mp3
```

**示例：**
```
D:\code\Description\backend\uploads\audio\tts-a1b2c3d4-e5f6-7890-abcd-ef1234567890.mp3
```

**文件说明：**
- Edge TTS 生成的翻译后音频
- MP3 格式
- 可用于预览或单独使用
- 不会自动清理（保留用于调试）

---

### 2. 配音视频文件 (最终产物)

**本地路径：**
```
backend/uploads/exports/dubbed-{原始文件名}-{时间戳}.mp4
```

**示例：**
```
D:\code\Description\backend\uploads\exports\dubbed-44a463cb-8c4f-489e-a702-0666e86f9530-1738489234567.mp4
```

**文件说明：**
- 替换了音轨的最终视频
- MP4 格式
- 原始视频画面 + 翻译后的中文配音
- 1小时后自动清理

---

## 🌐 HTTP 下载地址

### 1. TTS 音频下载

**API 端点：**
```
GET http://localhost:3001/api/export/audio/{filename}
```

**示例：**
```
http://localhost:3001/api/export/audio/tts-a1b2c3d4-e5f6-7890-abcd-ef1234567890.mp3
```

**响应头：**
- `Content-Type: audio/mpeg`
- `Content-Disposition: attachment; filename="tts-{uuid}.mp3"`

**使用方法：**
```bash
# 使用 curl 下载
curl -O http://localhost:3001/api/export/audio/tts-xxx.mp3

# 或在浏览器中直接访问
```

---

### 2. 配音视频下载

**API 端点：**
```
GET http://localhost:3001/api/export/download/{filename}
```

**示例：**
```
http://localhost:3001/api/export/download/dubbed-44a463cb-8c4f-489e-a702-0666e86f9530-1738489234567.mp4
```

**响应头：**
- `Content-Type: video/mp4`
- `Content-Disposition: attachment; filename="dubbed-{original}-{timestamp}.mp4"`

**使用方法：**
```bash
# 使用 curl 下载
curl -O http://localhost:3001/api/export/download/dubbed-xxx.mp4

# 或在浏览器中直接访问
```

---

## 📊 API 响应中的下载地址

执行翻译和配音工作流后，API 返回结果包含以下字段：

```json
{
  "success": true,
  "result": {
    "translatedText": "翻译后的文本...",
    "audioPath": "D:\\code\\Description\\backend\\uploads\\audio\\tts-xxx.mp3",
    "audioDownloadUrl": "/api/export/audio/tts-xxx.mp3",
    "outputVideoPath": "/uploads/exports/dubbed-xxx.mp4",
    "downloadUrl": "/api/export/download/dubbed-xxx.mp4",
    "steps": {
      "extractTranscript": { "success": true },
      "translate": { "success": true },
      "generateAudio": { "success": true },
      "replaceAudio": { "success": true }
    }
  }
}
```

### 字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `audioPath` | string | TTS音频本地绝对路径 |
| `audioDownloadUrl` | string | TTS音频下载相对URL |
| `outputVideoPath` | string | 配音视频本地相对路径 |
| `downloadUrl` | string | 配音视频下载相对URL |

### 构建完整下载URL：

```javascript
const baseUrl = 'http://localhost:3001';

// TTS 音频下载
const audioUrl = baseUrl + result.audioDownloadUrl;
// => http://localhost:3001/api/export/audio/tts-xxx.mp3

// 配音视频下载
const videoUrl = baseUrl + result.downloadUrl;
// => http://localhost:3001/api/export/download/dubbed-xxx.mp4
```

---

## 🔍 查找文件

### 1. 查找最近生成的 TTS 音频

**Windows PowerShell：**
```powershell
Get-ChildItem "D:\code\Description\backend\uploads\audio\tts-*.mp3" | Sort-Object LastWriteTime -Descending | Select-Object -First 5
```

**Linux/Mac：**
```bash
ls -lt backend/uploads/audio/tts-*.mp3 | head -5
```

### 2. 查找最近生成的配音视频

**Windows PowerShell：**
```powershell
Get-ChildItem "D:\code\Description\backend\uploads\exports\dubbed-*.mp4" | Sort-Object LastWriteTime -Descending | Select-Object -First 5
```

**Linux/Mac：**
```bash
ls -lt backend/uploads/exports/dubbed-*.mp4 | head -5
```

---

## 🚀 前端集成示例

### React 组件中使用：

```typescript
import { aiApi } from '@/lib/api';

async function handleDubbing(mediaId: string) {
  try {
    // 执行配音工作流
    const response = await aiApi.orchestrateEdit(
      'Translate & dub video',
      mediaId,
      { duration: 10, hasAudio: true },
      true
    );

    if (response.data.success && response.data.result) {
      const result = response.data.result;

      // 显示下载链接
      const audioUrl = `http://localhost:3001${result.audioDownloadUrl}`;
      const videoUrl = `http://localhost:3001${result.downloadUrl}`;

      console.log('TTS Audio:', audioUrl);
      console.log('Dubbed Video:', videoUrl);

      // 创建下载链接
      return (
        <div>
          <a href={audioUrl} download>下载音频</a>
          <a href={videoUrl} download>下载配音视频</a>
        </div>
      );
    }
  } catch (error) {
    console.error('Dubbing failed:', error);
  }
}
```

---

## ⚠️ 注意事项

1. **文件保留时间：**
   - TTS 音频：永久保留（不自动清理）
   - 配音视频：1小时后自动清理

2. **安全限制：**
   - 只能下载符合特定命名模式的文件
   - 音频文件：`tts-{uuid}.mp3`
   - 视频文件：`dubbed-{filename}-{timestamp}.mp4`

3. **CORS 配置：**
   - 开发环境允许所有 localhost 端口访问
   - 生产环境需要配置 `FRONTEND_URL` 环境变量

4. **代理问题：**
   - Edge TTS 调用时自动禁用代理
   - 下载请求正常使用代理（如果配置）

---

## 📝 完整工作流步骤和文件

```
用户上传视频
    ↓
步骤1: 提取转录 ✅
    → 存储在内存中
    ↓
步骤2: 翻译文本 ✅
    → 调用 AI API
    ↓
步骤3: 生成 TTS 音频 ✅
    → 输出: backend/uploads/audio/tts-{uuid}.mp3
    → 下载: /api/export/audio/tts-{uuid}.mp3
    ↓
步骤4: 替换视频音频 ✅
    → 输入: 原始视频 + TTS音频
    → 输出: backend/uploads/exports/dubbed-{name}-{time}.mp4
    → 下载: /api/export/download/dubbed-{name}-{time}.mp4
```

---

## 🛠️ 故障排除

### 问题：下载链接返回 404

**原因：** 文件已被清理或路径错误

**解决：**
1. 检查文件是否存在于本地路径
2. 验证文件名格式是否正确
3. 检查文件是否已超过1小时（视频文件）

### 问题：下载的音频/视频无法播放

**原因：** 文件生成失败或损坏

**解决：**
1. 查看后端日志中的错误信息
2. 检查 FFmpeg 是否正常工作
3. 验证 Edge TTS 是否成功生成音频

---

**更新时间：** 2026-02-02
**文档版本：** 1.0
