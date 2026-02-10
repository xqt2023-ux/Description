# 说话人识别与头像显示 - 技术规范文档

> **功能编号**: SD-001  
> **创建日期**: 2026-02-09  
> **状态**: 待开发  
> **预计工时**: 5-6小时

---

## 📋 功能概述

为视频转录功能添加说话人识别（Speaker Diarization）和头像显示功能，帮助用户区分不同说话人。

### 核心特性

1. ✅ **AI自动识别** - 使用pyannote.audio自动识别不同说话人
2. ✅ **混合模式** - AI识别结果可由用户手动调整
3. ✅ **头像提取** - 自动从视频中提取每个说话人的第一帧作为头像
4. ✅ **重命名支持** - 用户可将"说话人1"重命名为"Alice"等
5. ✅ **智能显示** - 只在说话人切换时显示头像，节省空间

---

## 🎯 用户故事

**作为视频编辑用户**
- 我希望系统能自动识别视频中不同的说话人
- 我希望看到每个说话人的头像
- 我希望能给说话人设置有意义的名字
- 我希望UI简洁，不重复显示相同说话人的头像

---

## 🏗️ 系统架构

### 技术栈

```
┌─────────────────────────────────────────┐
│          Frontend (Next.js)             │
│  - SpeakerAvatar.tsx                    │
│  - SpeakerHeader.tsx                    │
│  - TranscriptEditor.tsx (更新)          │
└──────────────┬──────────────────────────┘
               │ REST API
┌──────────────▼──────────────────────────┐
│       Backend (Node.js/Express)         │
│  - speakerDiarization.ts                │
│  - frameExtraction.ts                   │
└──────────────┬──────────────────────────┘
               │ HTTP
┌──────────────▼──────────────────────────┐
│      Python Service (Flask)             │
│  - pyannote.audio                       │
│  - diarization_service.py               │
└─────────────────────────────────────────┘
```

### 数据流

```
1. 用户上传视频
   ↓
2. 提取音频 (FFmpeg)
   ↓
3. 语音转文本 (Whisper)
   ↓
4. 说话人识别 (pyannote.audio) ← 新增
   ↓
5. 提取头像帧 (FFmpeg) ← 新增
   ↓
6. 存储到Transcript
   ↓
7. 前端渲染显示
```

---

## 📊 数据结构设计

### 1. Speaker类型定义

```typescript
// shared/types/index.ts

export interface Speaker {
  id: string;                    // "speaker-uuid"
  label: string;                 // "SPEAKER_00", "SPEAKER_01"
  customName?: string;           // "Alice", "Bob" (用户可编辑)
  color?: string;                // 头像边框颜色 "#FF6B6B"
  avatarPath?: string;           // "/uploads/avatars/xxx.jpg"
  avatarUrl?: string;            // 完整URL
  firstAppearance: number;       // 首次出现时间戳 (秒)
  totalDuration: number;         // 总说话时长 (秒)
  segmentCount: number;          // 说话片段数量
}
```

### 2. 扩展TranscriptSegment

```typescript
export interface TranscriptSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  words: Word[];
  
  // 新增字段
  speakerId?: string;            // 对应Speaker.id
  confidence?: number;           // 识别置信度 0-1
}
```

### 3. 扩展Transcript

```typescript
export interface Transcript {
  id: string;
  mediaId: string;
  language: string;
  segments: TranscriptSegment[];
  createdAt: string;
  updatedAt: string;
  
  // 新增字段
  speakers?: Speaker[];          // 说话人列表
  diarizationStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  diarizationError?: string;
}
```

---

## 🔧 技术实现细节

### Phase 1: Python服务搭建

#### 1.1 环境准备

```bash
# backend/python/setup.sh
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install pyannote.audio torch torchaudio flask
```

#### 1.2 requirements.txt

```txt
pyannote.audio==3.1.1
torch>=2.0.0
torchaudio>=2.0.0
flask==3.0.0
python-dotenv==1.0.0
```

#### 1.3 说话人识别服务

```python
# backend/python/diarization_service.py

from flask import Flask, request, jsonify
from pyannote.audio import Pipeline
import os

app = Flask(__name__)

# 加载模型 (需要HuggingFace token)
pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1",
    use_auth_token=os.getenv("HUGGINGFACE_TOKEN")
)

@app.route('/diarize', methods=['POST'])
def diarize():
    """
    说话人识别接口
    输入: { "audio_path": "/path/to/audio.wav" }
    输出: { "segments": [...], "speakers": [...] }
    """
    try:
        audio_path = request.json['audio_path']
        
        # 执行说话人识别
        diarization = pipeline(audio_path)
        
        # 解析结果
        segments = []
        speakers = set()
        
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            segments.append({
                "start": turn.start,
                "end": turn.end,
                "speaker": speaker
            })
            speakers.add(speaker)
        
        return jsonify({
            "success": True,
            "segments": segments,
            "speakers": list(speakers)
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

#### 1.4 启动脚本

```bash
# backend/python/start.sh
#!/bin/bash
source venv/bin/activate
python diarization_service.py
```

---

### Phase 2: Node.js后端集成

#### 2.1 调用Python服务

```typescript
// backend/src/services/speakerDiarization.ts

import axios from 'axios';

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:5000';

export interface DiarizationSegment {
  start: number;
  end: number;
  speaker: string;
}

export interface DiarizationResult {
  segments: DiarizationSegment[];
  speakers: string[];
}

/**
 * 调用Python服务进行说话人识别
 */
export async function performSpeakerDiarization(
  audioPath: string
): Promise<DiarizationResult> {
  try {
    const response = await axios.post(`${PYTHON_SERVICE_URL}/diarize`, {
      audio_path: audioPath
    }, {
      timeout: 300000, // 5分钟超时
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Diarization failed');
    }

    return {
      segments: response.data.segments,
      speakers: response.data.speakers
    };
  } catch (error: any) {
    console.error('Speaker diarization error:', error);
    throw new Error(`Failed to perform speaker diarization: ${error.message}`);
  }
}

/**
 * 将说话人识别结果映射到转录片段
 */
export function mapSpeakersToTranscript(
  transcriptSegments: TranscriptSegment[],
  diarizationSegments: DiarizationSegment[]
): TranscriptSegment[] {
  return transcriptSegments.map(segment => {
    // 找到与该转录片段重叠最多的说话人片段
    const overlappingSpeaker = findOverlappingSpeaker(
      segment.startTime,
      segment.endTime,
      diarizationSegments
    );

    return {
      ...segment,
      speakerId: overlappingSpeaker?.speaker,
      confidence: calculateConfidence(segment, overlappingSpeaker)
    };
  });
}

function findOverlappingSpeaker(
  start: number,
  end: number,
  diarizationSegments: DiarizationSegment[]
): DiarizationSegment | null {
  let maxOverlap = 0;
  let bestMatch: DiarizationSegment | null = null;

  for (const diaSeg of diarizationSegments) {
    const overlapStart = Math.max(start, diaSeg.start);
    const overlapEnd = Math.min(end, diaSeg.end);
    const overlap = Math.max(0, overlapEnd - overlapStart);

    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      bestMatch = diaSeg;
    }
  }

  return bestMatch;
}

function calculateConfidence(
  segment: TranscriptSegment,
  diarizationSegment: DiarizationSegment | null
): number {
  if (!diarizationSegment) return 0;

  const segmentDuration = segment.endTime - segment.startTime;
  const overlapStart = Math.max(segment.startTime, diarizationSegment.start);
  const overlapEnd = Math.min(segment.endTime, diarizationSegment.end);
  const overlap = Math.max(0, overlapEnd - overlapStart);

  return overlap / segmentDuration;
}
```

#### 2.2 视频帧提取

```typescript
// backend/src/services/frameExtraction.ts

import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

/**
 * 从视频中提取指定时间戳的帧
 */
export async function extractFrameAtTime(
  videoPath: string,
  timestamp: number,
  outputDir: string = path.join(__dirname, '../../uploads/avatars')
): Promise<string> {
  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `${uuidv4()}.jpg`);

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: [timestamp],
        filename: path.basename(outputPath),
        folder: outputDir,
        size: '320x240'
      })
      .on('end', () => {
        console.log(`Frame extracted: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error('Frame extraction error:', err);
        reject(new Error(`Failed to extract frame: ${err.message}`));
      });
  });
}

/**
 * 为所有说话人提取头像
 */
export async function extractSpeakerAvatars(
  videoPath: string,
  speakers: DiarizationSegment[]
): Promise<Map<string, string>> {
  const avatarMap = new Map<string, string>();
  const processedSpeakers = new Set<string>();

  for (const segment of speakers) {
    if (processedSpeakers.has(segment.speaker)) {
      continue; // 已处理过此说话人
    }

    try {
      const avatarPath = await extractFrameAtTime(
        videoPath,
        segment.start + 0.5 // 稍微延迟0.5秒，避免黑屏
      );
      avatarMap.set(segment.speaker, avatarPath);
      processedSpeakers.add(segment.speaker);
    } catch (error) {
      console.error(`Failed to extract avatar for ${segment.speaker}:`, error);
    }
  }

  return avatarMap;
}
```

#### 2.3 集成到转录流程

```typescript
// backend/src/services/transcription.ts (更新)

import { performSpeakerDiarization, mapSpeakersToTranscript } from './speakerDiarization';
import { extractSpeakerAvatars } from './frameExtraction';

async function processTranscriptionJob(jobId: string): Promise<void> {
  const job = jobStore.get<TranscriptionJobData>(jobId);
  if (!job) return;

  try {
    // ... 现有的转录逻辑 ...

    jobStore.update(jobId, { progress: 60 });

    // 新增：说话人识别
    if (process.env.ENABLE_SPEAKER_DIARIZATION === 'true') {
      console.log('[Transcription] Performing speaker diarization...');
      
      const diarizationResult = await performSpeakerDiarization(audioPath);
      
      // 映射说话人到转录片段
      transcript.segments = mapSpeakersToTranscript(
        transcript.segments,
        diarizationResult.segments
      );

      // 提取头像
      const avatarMap = await extractSpeakerAvatars(
        filePath,
        diarizationResult.segments
      );

      // 创建Speaker对象
      transcript.speakers = diarizationResult.speakers.map(speakerLabel => ({
        id: `speaker-${uuidv4()}`,
        label: speakerLabel,
        customName: undefined,
        avatarPath: avatarMap.get(speakerLabel),
        avatarUrl: avatarMap.get(speakerLabel)
          ? `/api/media/avatar/${path.basename(avatarMap.get(speakerLabel)!)}`
          : undefined,
        firstAppearance: findFirstAppearance(diarizationResult.segments, speakerLabel),
        totalDuration: calculateTotalDuration(diarizationResult.segments, speakerLabel),
        segmentCount: countSegments(diarizationResult.segments, speakerLabel),
      }));

      transcript.diarizationStatus = 'completed';
    }

    jobStore.update(jobId, { progress: 90 });

    // ... 其余逻辑 ...
  } catch (error: any) {
    // ... 错误处理 ...
  }
}
```

#### 2.4 新增API路由

```typescript
// backend/src/routes/transcription.ts (新增)

/**
 * 更新说话人信息（重命名、手动调整）
 */
router.put('/transcript/:transcriptId/speakers/:speakerId', async (req, res) => {
  try {
    const { transcriptId, speakerId } = req.params;
    const { customName, color } = req.body;

    // 加载transcript
    const transcript = await loadTranscript(transcriptId);
    if (!transcript) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    // 更新说话人信息
    const speaker = transcript.speakers?.find(s => s.id === speakerId);
    if (!speaker) {
      return res.status(404).json({ error: 'Speaker not found' });
    }

    if (customName !== undefined) {
      speaker.customName = customName;
    }
    if (color !== undefined) {
      speaker.color = color;
    }

    // 保存
    await saveTranscript(transcript);

    res.json({
      success: true,
      speaker
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 手动调整片段的说话人
 */
router.put('/transcript/:transcriptId/segment/:segmentId/speaker', async (req, res) => {
  try {
    const { transcriptId, segmentId } = req.params;
    const { speakerId } = req.body;

    const transcript = await loadTranscript(transcriptId);
    if (!transcript) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    const segment = transcript.segments.find(s => s.id === segmentId);
    if (!segment) {
      return res.status(404).json({ error: 'Segment not found' });
    }

    segment.speakerId = speakerId;
    segment.confidence = 1.0; // 手动设置，置信度为1

    await saveTranscript(transcript);

    res.json({
      success: true,
      segment
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

---

### Phase 3: 前端实现

#### 3.1 SpeakerAvatar组件

```tsx
// frontend/src/components/editor/SpeakerAvatar.tsx

import { Speaker } from '@/types';

interface SpeakerAvatarProps {
  speaker: Speaker;
  size?: 'sm' | 'md' | 'lg';
}

export function SpeakerAvatar({ speaker, size = 'md' }: SpeakerAvatarProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  const displayName = speaker.customName || speaker.label;
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div 
      className={`${sizeClasses[size]} rounded-full overflow-hidden border-2 flex items-center justify-center`}
      style={{ borderColor: speaker.color || '#6B7280' }}
    >
      {speaker.avatarUrl ? (
        <img
          src={speaker.avatarUrl}
          alt={displayName}
          className="w-full h-full object-cover"
        />
      ) : (
        <div 
          className="w-full h-full flex items-center justify-center text-white font-semibold"
          style={{ backgroundColor: speaker.color || '#6B7280' }}
        >
          {initials}
        </div>
      )}
    </div>
  );
}
```

#### 3.2 SpeakerHeader组件

```tsx
// frontend/src/components/editor/SpeakerHeader.tsx

import { useState } from 'react';
import { Speaker } from '@/types';
import { SpeakerAvatar } from './SpeakerAvatar';
import { Edit2, Check, X } from 'lucide-react';

interface SpeakerHeaderProps {
  speaker: Speaker;
  onRename: (speakerId: string, newName: string) => void;
}

export function SpeakerHeader({ speaker, onRename }: SpeakerHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(speaker.customName || speaker.label);

  const handleSave = () => {
    onRename(speaker.id, editName);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(speaker.customName || speaker.label);
    setIsEditing(false);
  };

  return (
    <div className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-lg mb-2">
      <SpeakerAvatar speaker={speaker} size="md" />
      
      <div className="flex-1">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') handleCancel();
              }}
            />
            <button
              onClick={handleSave}
              className="p-1 text-green-600 hover:bg-green-50 rounded"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={handleCancel}
              className="p-1 text-gray-600 hover:bg-gray-100 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {speaker.customName || speaker.label}
            </span>
            <button
              onClick={() => setIsEditing(true)}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            >
              <Edit2 className="w-3 h-3" />
            </button>
          </div>
        )}
        <p className="text-xs text-gray-500">
          {Math.round(speaker.totalDuration)}s · {speaker.segmentCount} segments
        </p>
      </div>
    </div>
  );
}
```

#### 3.3 更新TranscriptEditor

```tsx
// frontend/src/components/editor/TranscriptEditor.tsx (更新)

import { SpeakerHeader } from './SpeakerHeader';
import { updateSpeakerName, updateSegmentSpeaker } from '@/lib/api';

export function TranscriptEditor() {
  const { transcript, updateTranscript } = useEditorStore();

  const handleRenameSpeaker = async (speakerId: string, newName: string) => {
    try {
      await updateSpeakerName(transcript.id, speakerId, newName);
      // 更新本地状态
      updateTranscript({
        speakers: transcript.speakers?.map(s => 
          s.id === speakerId ? { ...s, customName: newName } : s
        )
      });
    } catch (error) {
      console.error('Failed to rename speaker:', error);
    }
  };

  const getSpeaker = (speakerId?: string) => {
    return transcript.speakers?.find(s => s.id === speakerId);
  };

  return (
    <div className="space-y-2">
      {transcript.segments.map((segment, index) => {
        const prevSegment = index > 0 ? transcript.segments[index - 1] : null;
        const showSpeaker = segment.speakerId && 
          segment.speakerId !== prevSegment?.speakerId;
        
        const speaker = getSpeaker(segment.speakerId);

        return (
          <div key={segment.id}>
            {showSpeaker && speaker && (
              <SpeakerHeader
                speaker={speaker}
                onRename={handleRenameSpeaker}
              />
            )}
            
            <div className="pl-3 py-1 text-sm text-gray-700">
              {segment.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

---

## 🧪 测试计划

### 单元测试

```typescript
// backend/src/__tests__/speakerDiarization.test.ts

describe('Speaker Diarization', () => {
  test('should map speakers to transcript segments', () => {
    // 测试说话人映射逻辑
  });

  test('should calculate speaker confidence', () => {
    // 测试置信度计算
  });

  test('should extract frame at specific timestamp', () => {
    // 测试视频帧提取
  });
});
```

### 集成测试

```typescript
// E2E测试场景
1. 上传包含2个说话人的视频
2. 等待转录完成
3. 验证识别出2个说话人
4. 验证每个说话人都有头像
5. 重命名说话人
6. 手动调整某段的说话人
7. 验证UI更新正确
```

---

## 📝 环境配置

### .env配置

```bash
# Python服务
PYTHON_SERVICE_URL=http://localhost:5000
ENABLE_SPEAKER_DIARIZATION=true

# HuggingFace Token (用于下载pyannote模型)
HUGGINGFACE_TOKEN=hf_xxxxxxxxxxxx
```

### 启动顺序

```bash
# 1. 启动Python服务
cd backend/python
python diarization_service.py

# 2. 启动Node.js后端
cd backend
npm run dev

# 3. 启动前端
cd frontend
npm run dev
```

---

## ⚠️ 注意事项与限制

### 技术限制

1. **首次使用需下载模型** - 约500MB，需要良好的网络
2. **处理时间** - 5分钟视频约需30秒-2分钟处理
3. **内存需求** - 建议至少4GB可用内存
4. **GPU加速** - 支持CUDA，可大幅提升速度

### 已知问题

1. **重叠语音** - 多人同时说话时识别可能不准确
2. **背景音乐** - 强背景音乐可能影响识别精度
3. **相似声音** - 音色相似的说话人可能被识别为同一人

### 解决方案

- 提供手动调整功能（混合模式）
- 显示置信度，让用户判断
- 支持合并/分割说话人

---

## 📅 开发排期

| 阶段 | 任务 | 预计时间 | 负责人 |
|------|------|---------|--------|
| Phase 1 | Python服务搭建 | 1小时 | Backend |
| Phase 2 | Node.js集成 | 2-3小时 | Backend |
| Phase 3 | 前端开发 | 2小时 | Frontend |
| Phase 4 | 测试与优化 | 1小时 | QA |

**总计**: 5-6小时

---

## ✅ 验收标准

1. ✅ 能自动识别视频中的不同说话人
2. ✅ 每个说话人显示头像（从视频提取）
3. ✅ 只在说话人切换时显示头像
4. ✅ 用户可以重命名说话人
5. ✅ 用户可以手动调整片段的说话人归属
6. ✅ 识别准确率 > 80%（正常对话场景）
7. ✅ 5分钟视频处理时间 < 3分钟

---

## 🔗 相关文档

- [pyannote.audio文档](https://github.com/pyannote/pyannote-audio)
- [Speaker Diarization论文](https://arxiv.org/abs/2012.01477)
- [FFmpeg文档](https://ffmpeg.org/documentation.html)

---

**文档版本**: 1.0  
**最后更新**: 2026-02-09  
**审核状态**: 待审核
