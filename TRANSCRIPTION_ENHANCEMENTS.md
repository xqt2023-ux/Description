# 转录增强功能 (Transcription Enhancements)

## 概述

转录服务现在支持以下AI增强功能,全部自动应用于每次转录:

1. **说话人识别** - 自动识别并标注不同的说话人
2. **填充词移除** - 智能移除"嗯"、"啊"等语气词
3. **章节标记** - 自动生成视频章节和时间戳
4. **标题生成** - 根据内容自动生成吸引人的标题
5. **内容摘要** - 生成转录内容的简洁摘要

## 功能详情

### 1. 说话人识别 (Speaker Diarization)

AI分析转录文本的模式和主题变化,识别不同的说话人。

**特性:**
- 自动检测1-5个说话人
- 为每个说话人分配唯一ID和颜色
- 在UI中可视化显示说话人切换

**类型定义:**
```typescript
interface Speaker {
  id: string;              // 说话人ID (例如 "speaker-1")
  name: string;            // 显示名称 (例如 "说话人 1")
  color?: string;          // UI颜色标识
  segmentCount: number;    // 该说话人的片段数量
}

interface TranscriptSegment {
  speakerId?: string;      // 所属说话人ID
  speakerName?: string;    // 说话人名称
  // ...其他字段
}
```

### 2. 填充词移除 (Filler Word Removal)

智能移除口语化的填充词,同时保持语句的自然流畅。

**支持语言:**
- **英文**: um, uh, like, you know, so, actually, basically, literally, right, I mean, kind of, sort of, well, yeah, okay
- **中文**: 嗯, 啊, 呃, 那个, 这个, 就是, 然后, 对吧, 是吧, 其实, 反正, 就是说, 怎么说呢

**特性:**
- 保持原意和自然流程
- 不影响时间戳同步
- 标记 `fillerWordsRemoved: true`

### 3. 章节标记 (Chapter Generation)

根据内容的主题变化自动生成章节标记。

**特性:**
- 生成3-8个逻辑章节
- 使用描述性、吸引人的章节标题
- 包含起止时间戳
- 关联相关的转录片段

**类型定义:**
```typescript
interface Chapter {
  id: string;            // 章节ID
  title: string;         // 章节标题
  startTime: number;     // 开始时间(秒)
  endTime: number;       // 结束时间(秒)
  segmentIds: string[];  // 包含的片段ID列表
}
```

**示例输出:**
```
[0:00 - 2:30] 介绍和背景
[2:30 - 5:15] 主要功能演示
[5:15 - 7:45] 技术实现细节
[7:45 - 9:00] 总结和展望
```

### 4. 标题生成 (Title Generation)

基于转录内容自动生成吸引人的标题。

**特性:**
- 8-15个词的标题长度
- 捕捉核心主题
- 使用与转录相同的语言
- 适合用作视频标题

**示例:**
- "如何使用AI增强视频转录:完整指南"
- "深入探讨现代Web开发的最佳实践"

### 5. 内容摘要 (Summary Generation)

生成转录内容的简洁摘要。

**特性:**
- 包含关键要点
- 突出主要讨论话题
- 适合快速预览
- 可用于视频描述

**示例:**
```
本视频介绍了如何使用AI技术增强视频转录功能。主要内容包括:
- 说话人自动识别和标注
- 智能填充词移除
- 章节自动生成
- 以及如何将这些功能集成到现有系统中
```

## 技术实现

### 架构

```
transcription.ts
  ↓
  调用 Groq/OpenAI Whisper API
  ↓
  生成基础转录
  ↓
  调用 transcriptionEnhancement.ts
  ↓
  应用AI增强 (使用 Claude API)
  ↓
  返回增强后的转录
```

### 关键文件

1. **`shared/types/index.ts`**
   - 更新了 `Transcript`, `TranscriptSegment` 类型
   - 添加了 `Speaker`, `Chapter` 类型

2. **`backend/src/services/claude.ts`**
   - `generateTitle()` - 标题生成
   - `generateSummary()` - 摘要生成
   - `generateChapters()` - 章节生成
   - `identifySpeakers()` - 说话人识别
   - `removeFillerWords()` - 填充词移除

3. **`backend/src/services/transcriptionEnhancement.ts`**
   - `enhanceTranscript()` - 主增强函数
   - `applySpeakerIdentification()` - 应用说话人标识
   - `applyFillerWordRemoval()` - 应用填充词移除
   - `processChapters()` - 处理章节数据

4. **`backend/src/services/transcription.ts`**
   - `processTranscriptionJob()` - 集成AI增强到转录流程

## 配置

### 环境变量

在 `backend/.env` 中设置:

```env
# Anthropic Claude API (必需,用于AI增强)
ANTHROPIC_API_KEY=sk-ant-xxx

# Groq API (推荐,用于转录)
GROQ_API_KEY=gsk_xxx

# 或者 OpenAI API (备用)
OPENAI_API_KEY=sk-proj-xxx
```

### 启用/禁用功能

如果没有配置 `ANTHROPIC_API_KEY`,系统会跳过AI增强,仅返回基础转录。

**自定义增强选项:**
```typescript
// 可选:自定义哪些功能启用
const options: EnhancementOptions = {
  identifySpeakers: true,   // 识别说话人
  removeFillers: true,       // 移除填充词
  generateChapters: true,    // 生成章节
  generateTitle: true,       // 生成标题
  generateSummary: true,     // 生成摘要
};

await enhanceTranscript(transcript, options);
```

## 使用示例

### API使用

转录现在自动包含所有增强功能:

```bash
# 1. 启动转录
POST /api/transcriptions/start
{
  "mediaId": "media-123",
  "filePath": "/uploads/videos/video.mp4",
  "language": "zh"
}

# 2. 获取结果
GET /api/transcriptions/:jobId/status

# 响应包含增强后的转录:
{
  "success": true,
  "data": {
    "jobId": "job-123",
    "status": "completed",
    "result": {
      "id": "transcript-123",
      "title": "AI增强视频转录功能介绍",
      "summary": "本视频详细介绍了...",
      "speakers": [
        {
          "id": "speaker-1",
          "name": "说话人 1",
          "color": "#3B82F6",
          "segmentCount": 15
        }
      ],
      "chapters": [
        {
          "id": "chapter-1",
          "title": "介绍",
          "startTime": 0,
          "endTime": 120
        }
      ],
      "segments": [
        {
          "id": "seg-1",
          "text": "大家好,今天我们来讨论...",
          "startTime": 0,
          "endTime": 5.2,
          "speakerId": "speaker-1",
          "speakerName": "说话人 1",
          "words": [...]
        }
      ],
      "fillerWordsRemoved": true
    }
  }
}
```

### 前端展示

在UI中可以展示:

1. **标题** - 作为视频/项目标题
2. **摘要** - 在预览卡片中显示
3. **说话人** - 用颜色标识不同说话人
4. **章节** - 显示为可点击的时间戳导航
5. **清理后的文本** - 更专业的转录文本

## 性能考虑

- **转录时间**: 基础转录 + AI增强约增加10-30秒
- **成本**: Anthropic Claude API按token计费
- **可选**: 可以先返回基础转录,后台异步应用增强

## 错误处理

系统设计为优雅降级:
- 如果AI增强失败,返回基础转录
- 单个功能失败不影响其他功能
- 所有错误都会记录到控制台

## 未来改进

1. **实时说话人识别** - 使用音频特征分析
2. **自定义填充词列表** - 用户可配置
3. **多语言章节标题** - 支持更多语言
4. **情感分析** - 识别语气和情感
5. **关键词提取** - 自动标签生成

## 相关API文档

- [Anthropic Claude API](https://docs.anthropic.com/)
- [Groq Whisper API](https://console.groq.com/docs)
- [OpenAI Whisper API](https://platform.openai.com/docs/guides/speech-to-text)

## 贡献

如需改进或添加新的增强功能,请修改:
- `backend/src/services/claude.ts` - 添加新的AI功能
- `backend/src/services/transcriptionEnhancement.ts` - 集成新功能
- `shared/types/index.ts` - 更新类型定义
