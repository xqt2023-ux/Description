# Studio Sound 音频增强 - 技术规范文档

> **功能编号**: AUDIO-001  
> **创建日期**: 2026-02-09  
> **状态**: 待开发  
> **预计工时**: 2-3小时

---

## 📋 功能概述

为上传的音频/视频自动应用AI音频增强处理，提升到录音棚级别的音质。

### 核心特性

1. ✅ **背景噪音消除** - 去除嘶嘶声、嗡嗡声、环境杂音
2. ✅ **音量标准化** - 自动调整音量到标准水平
3. ✅ **音质增强** - 提升清晰度和频率响应
4. ✅ **回声消除** - 去除房间回声和混响

### 应用场景

- **播客录制**：提升家庭录制音质
- **视频旁白**：消除环境噪音
- **会议录音**：增强语音清晰度
- **采访录音**：标准化音量

---

## 🎯 用户体验

### 使用流程

```
用户上传视频/音频
     ↓
显示"正在增强音频..."进度
     ↓
后台自动调用AI服务
     ↓
音频增强完成
     ↓
继续转录等后续处理
```

### UI展示

**上传时提示**：
- "正在优化音质..."
- "Studio Sound: 消除背景噪音中..."
- "Studio Sound: 完成！音质已提升"

**结果对比**（可选）：
- 原始音频波形
- 增强后音频波形
- 一键切换试听

---

## 🏗️ 技术架构

### 系统流程

```
┌─────────────────────────────────────────┐
│       Frontend Upload                   │
│  - 文件上传                               │
│  - 进度显示                               │
└──────────────┬──────────────────────────┘
               │ HTTP Upload
┌──────────────▼──────────────────────────┐
│      Backend Upload Handler             │
│  1. 保存原始文件                          │
│  2. 提取音频（如果是视频）                  │
│  3. 调用 audioEnhancement.ts            │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│   Adobe Podcast API / 其他AI服务         │
│  - Enhance Speech                       │
│  - 降噪、标准化、增强                      │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│    Replace Original Audio               │
│  - 保存增强后的音频                        │
│  - 更新Media记录                          │
│  - 继续转录流程                            │
└─────────────────────────────────────────┘
```

---

## 🔧 技术方案：Adobe Podcast API

### 为什么选择Adobe Podcast

1. **专业效果**：录音棚级音质
2. **一键处理**：单个API调用完成所有增强
3. **免费额度**：每月有免费额度
4. **简单集成**：RESTful API，易于使用

### API规格

**Endpoint**:
```
POST https://podcast.adobe.io/audio/speech-enhance
```

**请求**:
```http
POST /audio/speech-enhance HTTP/1.1
Host: podcast.adobe.io
Authorization: Bearer YOUR_API_KEY
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="file"; filename="audio.mp3"
Content-Type: audio/mpeg

[音频文件二进制数据]
--boundary--
```

**响应**:
```json
{
  "success": true,
  "enhancedAudioUrl": "https://cdn.adobe.io/enhanced/abc123.mp3",
  "processingTime": 12.5,
  "improvements": {
    "noiseReduction": "85%",
    "volumeNormalized": true,
    "echoRemoval": true
  }
}
```

### 定价

- **免费额度**：每月100分钟
- **付费**：$0.02/分钟（超出免费额度后）

---

## 📊 数据结构设计

### Media元数据扩展

```typescript
// shared/types/index.ts

export interface MediaMetadata {
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  bitrate?: number;
  
  // 新增：音频增强信息
  audioEnhanced?: boolean;           // 是否已增强
  audioEnhancementStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  originalAudioPath?: string;        // 原始音频路径（备份）
  enhancedAudioPath?: string;        // 增强后音频路径
  enhancementStats?: AudioEnhancementStats;
}

export interface AudioEnhancementStats {
  noiseReductionLevel: number;      // 降噪级别 0-100
  volumeAdjustment: number;         // 音量调整 dB
  processingTime: number;           // 处理耗时（秒）
  provider: 'adobe' | 'krisp' | 'local'; // 使用的服务
}
```

---

## 💻 代码实现

### 1. Adobe Podcast API集成

```typescript
// backend/src/services/audioEnhancement.ts

import FormData from 'form-data';
import fs from 'fs';
import axios from 'axios';
import { AudioEnhancementStats } from '../../../shared/types';

const ADOBE_API_KEY = process.env.ADOBE_PODCAST_API_KEY;
const ADOBE_ENDPOINT = 'https://podcast.adobe.io/audio/speech-enhance';

export interface AudioEnhancementResult {
  success: boolean;
  enhancedAudioPath: string;
  stats: AudioEnhancementStats;
  error?: string;
}

/**
 * 使用Adobe Podcast API增强音频
 */
export async function enhanceAudioWithAdobe(
  audioPath: string,
  outputPath: string
): Promise<AudioEnhancementResult> {
  try {
    console.log('[AudioEnhancement] Starting enhancement with Adobe Podcast...');
    const startTime = Date.now();

    // 创建表单数据
    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioPath));
    formData.append('noiseReduction', 'high');
    formData.append('volumeNormalization', 'true');
    formData.append('echoRemoval', 'true');

    // 调用API
    const response = await axios.post(ADOBE_ENDPOINT, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${ADOBE_API_KEY}`,
      },
      timeout: 300000, // 5分钟超时
    });

    // 下载增强后的音频
    const enhancedAudioUrl = response.data.enhancedAudioUrl;
    const audioResponse = await axios.get(enhancedAudioUrl, {
      responseType: 'stream'
    });

    // 保存到本地
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(outputPath);
      audioResponse.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const processingTime = (Date.now() - startTime) / 1000;

    console.log(`[AudioEnhancement] Completed in ${processingTime}s`);

    return {
      success: true,
      enhancedAudioPath: outputPath,
      stats: {
        noiseReductionLevel: response.data.improvements.noiseReduction || 0,
        volumeAdjustment: response.data.improvements.volumeAdjustment || 0,
        processingTime,
        provider: 'adobe',
      },
    };

  } catch (error: any) {
    console.error('[AudioEnhancement] Failed:', error);
    return {
      success: false,
      enhancedAudioPath: '',
      stats: {
        noiseReductionLevel: 0,
        volumeAdjustment: 0,
        processingTime: 0,
        provider: 'adobe',
      },
      error: error.message,
    };
  }
}

/**
 * 主音频增强函数（支持多种后端）
 */
export async function enhanceAudio(
  audioPath: string,
  outputPath: string
): Promise<AudioEnhancementResult> {
  // 优先使用Adobe
  if (process.env.ADOBE_PODCAST_API_KEY) {
    return enhanceAudioWithAdobe(audioPath, outputPath);
  }

  // 其他备用方案...
  throw new Error('No audio enhancement service configured');
}
```

### 2. 集成到上传流程

```typescript
// backend/src/routes/media.ts (更新)

import { enhanceAudio } from '../services/audioEnhancement';

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // ... 保存文件逻辑 ...

    // 新增：自动音频增强
    if (process.env.ENABLE_AUTO_AUDIO_ENHANCEMENT === 'true') {
      console.log('[Upload] Auto-enhancing audio...');
      
      let audioPath = file.path;
      
      // 如果是视频，先提取音频
      if (isVideoFile(file.path)) {
        audioPath = await extractAudioFromVideo(file.path);
      }

      // 音频增强
      const enhancedPath = audioPath.replace('.mp3', '_enhanced.mp3');
      const enhancementResult = await enhanceAudio(audioPath, enhancedPath);

      if (enhancementResult.success) {
        // 替换原始音频
        fs.renameSync(enhancedPath, audioPath);
        
        // 更新metadata
        mediaRecord.metadata.audioEnhanced = true;
        mediaRecord.metadata.audioEnhancementStatus = 'completed';
        mediaRecord.metadata.enhancementStats = enhancementResult.stats;
        
        console.log('[Upload] Audio enhancement completed');
      } else {
        console.warn('[Upload] Audio enhancement failed, using original');
      }
    }

    // 继续转录等后续流程...
    res.json({ success: true, media: mediaRecord });

  } catch (error) {
    // 错误处理...
  }
});
```

### 3. 前端进度显示

```typescript
// frontend/src/components/editor/MediaUploader.tsx (更新)

export function MediaUploader() {
  const [uploadStage, setUploadStage] = useState<'upload' | 'enhance' | 'transcribe' | 'done'>('upload');

  const handleUpload = async (file: File) => {
    try {
      // 上传阶段
      setUploadStage('upload');
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData,
        onUploadProgress: (e) => {
          // 上传进度
        }
      });

      // 增强阶段
      setUploadStage('enhance');
      // API会自动增强，等待完成

      // 转录阶段
      setUploadStage('transcribe');
      // ...

    } catch (error) {
      // 错误处理
    }
  };

  return (
    <div>
      {uploadStage === 'enhance' && (
        <div className="flex items-center gap-2">
          <Loader className="animate-spin" />
          <span>正在优化音质（Studio Sound）...</span>
        </div>
      )}
    </div>
  );
}
```

---

## 🧪 测试计划

### 单元测试

```typescript
// backend/src/__tests__/audioEnhancement.test.ts

describe('Audio Enhancement', () => {
  test('should enhance audio with Adobe API', async () => {
    const inputPath = 'test/fixtures/sample.mp3';
    const outputPath = 'test/output/enhanced.mp3';
    
    const result = await enhanceAudioWithAdobe(inputPath, outputPath);
    
    expect(result.success).toBe(true);
    expect(result.enhancedAudioPath).toBe(outputPath);
    expect(result.stats.noiseReductionLevel).toBeGreaterThan(0);
  });

  test('should fallback gracefully on API failure', async () => {
    // 测试API失败时的fallback
  });
});
```

### 集成测试

```typescript
// 测试场景
1. 上传带噪音的音频 → 验证噪音被消除
2. 上传低音量音频 → 验证音量被标准化
3. 上传视频文件 → 验证音频被提取并增强
4. API失败 → 验证系统仍能正常工作（使用原始音频）
```

---

## 📝 环境配置

### .env配置

```bash
# Adobe Podcast API
ADOBE_PODCAST_API_KEY=your_api_key_here

# 功能开关
ENABLE_AUTO_AUDIO_ENHANCEMENT=true

# 可选：其他音频增强服务
# KRISP_API_KEY=your_krisp_key
# DOLBY_API_KEY=your_dolby_key
```

### 获取Adobe API Key

1. 访问 https://podcast.adobe.com/
2. 注册/登录Adobe账号
3. 进入API Keys页面
4. 创建新的API Key
5. 复制并保存到.env文件

---

## ⚠️ 注意事项

### 限制与约束

1. **处理时间**：通常为音频时长的0.5-1倍
2. **文件大小**：最大500MB
3. **格式支持**：MP3, WAV, M4A, FLAC
4. **免费额度**：每月100分钟，超出后按使用量计费

### 已知问题

1. **音乐处理**：可能过度处理背景音乐
2. **多说话人**：对重叠语音效果一般
3. **极端噪音**：非常嘈杂的环境可能无法完全消除

### 解决方案

- 提供"跳过增强"选项
- 保留原始音频备份
- 允许用户手动切换原始/增强版本

---

## 📅 开发排期

| 阶段 | 任务 | 预计时间 |
|------|------|---------|
| Phase 1 | Adobe API集成 | 1小时 |
| Phase 2 | 上传流程集成 | 30分钟 |
| Phase 3 | 前端进度显示 | 30分钟 |
| Phase 4 | 测试与优化 | 30分钟 |

**总计**: 2.5-3小时

---

## ✅ 验收标准

1. ✅ 上传音频/视频自动触发音频增强
2. ✅ 显示增强进度和状态
3. ✅ 背景噪音明显减少
4. ✅ 音量标准化到合适水平
5. ✅ 音质清晰度提升
6. ✅ 回声基本消除
7. ✅ 增强失败时能graceful fallback
8. ✅ 处理时间 < 音频时长 × 2

---

## 🔗 相关文档

- [Adobe Podcast API文档](https://podcast.adobe.com/api-docs)
- [音频处理最佳实践](https://developer.adobe.com/podcast/docs/best-practices)

---

**文档版本**: 1.0  
**最后更新**: 2026-02-09  
**审核状态**: 待审核
