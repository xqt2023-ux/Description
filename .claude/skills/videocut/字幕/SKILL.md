---
name: videocut:字幕
description: 字幕生成与烧录。火山引擎转录→词典纠错→审核→烧录。触发词：加字幕、生成字幕、字幕
---

<!--
input: 视频文件
output: 带字幕视频
pos: 后置 skill，剪辑完成后调用
-->

# 字幕

> 转录 → Agent校对 → 人工审核 → 烧录

## 核心流程（总计约 8-15 分钟，含人工审核）

1. 提取音频 + 上传          ~1min
2. 火山引擎转录（带热词）    ~2min
3. Agent 自动校对            ~3-5min
4. 人工审核确认              取决于用户
5. 烧录字幕                  ~1-2min

## 输出目录结构

```
output/
└── YYYY-MM-DD_视频名/
    └── 字幕/
        ├── 1_转录/
        │   ├── audio.mp3
        │   ├── volcengine_result.json
        │   └── subtitles_with_time.json
        ├── 2_校对/
        │   └── 校对记录.md
        └── 3_审核/
            └── output_with_subtitles.mp4
```

## Step 1: 提取音频并上传

```bash
VIDEO_PATH="/path/to/视频.mp4"
VIDEO_NAME=$(basename "$VIDEO_PATH" .mp4)
DATE=$(date +%Y-%m-%d)
BASE_DIR="output/${DATE}_${VIDEO_NAME}/字幕"
mkdir -p "$BASE_DIR/1_转录" "$BASE_DIR/2_校对" "$BASE_DIR/3_审核"

cd "$BASE_DIR/1_转录"

# 提取音频
ffmpeg -i "file:$VIDEO_PATH" -vn -acodec libmp3lame -y audio.mp3

# 上传获取公网 URL
curl -s -F "files[]=@audio.mp3" https://uguu.se/upload
# 返回: {"success":true,"files":[{"url":"https://h.uguu.se/xxx.mp3"}]}
```

## Step 2: 火山引擎转录（带热词）

```bash
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
"$SKILL_DIR/scripts/volcengine_transcribe.sh" "https://h.uguu.se/xxx.mp3"
# 输出: volcengine_result.json（自动加载词典.txt热词）
```

### 生成带时间戳的字幕

```bash
node -e "
const result = require('./volcengine_result.json');
const subtitles = [];
for (const utt of result.utterances) {
  subtitles.push({
    text: utt.text,
    start: utt.start_time / 1000,
    end: utt.end_time / 1000,
    words: utt.words ? utt.words.map(w => ({
      text: w.text,
      start: w.start_time / 1000,
      end: w.end_time / 1000
    })) : []
  });
}
require('fs').writeFileSync('subtitles_with_time.json', JSON.stringify(subtitles, null, 2));
console.log('字幕条数:', subtitles.length);
"
cd ..
```

## Step 3: Agent 自动校对

### 3.1 读取字幕

```bash
cd 2_校对
node -e "
const subs = require('../1_转录/subtitles_with_time.json');
subs.forEach((s, i) => console.log(i + '|' + s.start.toFixed(2) + '-' + s.end.toFixed(2) + '|' + s.text));
" > subtitles_readable.txt
```

### 3.2 Agent 手动校对（逐行阅读）

**Agent 必须逐行人工阅读字幕，不能只靠规则脚本！**

分段读取并校对（每次 50 行）：

```
1. Read subtitles_readable.txt offset=N limit=50
2. 逐行检查误识别
3. 记录修改到 校对记录.md
4. N += 50，回到步骤1
```

#### 常见误识别规则表

| 误识别 | 应为 | 类型 |
|--------|------|------|
| cloud code | Claude Code | 同音 |
| excuse | execute | 同音 |
| scale | skill | 同音 |
| 眼影 | 演示 | 同音 |
| 表述 | 暴露 | 同音 |
| 拿出来 | 那出来 | - |

#### 常见漏字问题

- 句尾"的"、"了"、"吗"经常漏
- 数字后的量词经常漏
- 人名/专有名词容易错

### 3.3 对照原稿校对（如有原稿）

如用户提供文字稿，逐句对照核查。

### 3.4 修改字幕

```bash
node -e "
const fs = require('fs');
const subs = JSON.parse(fs.readFileSync('../1_转录/subtitles_with_time.json', 'utf8'));
// 根据校对记录修改
// subs[N].text = '正确文字';
fs.writeFileSync('../1_转录/subtitles_with_time.json', JSON.stringify(subs, null, 2));
"
```

## Step 4: 启动审核服务器

```bash
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd ../3_审核

node "$SKILL_DIR/scripts/subtitle_server.js" 8898 "$VIDEO_PATH"
# 打开 http://localhost:8898
```

用户在网页中：
- 播放视频逐条核对字幕
- 直接编辑错误文字
- 点击「导出 SRT」或「烧录字幕」

## Step 5: 烧录字幕（FFmpeg）

```bash
# 生成 ASS 字幕文件（金黄粗体）
# 规格：22pt，金黄色 #ffde00，2px黑色描边，底部 30px

ffmpeg -i "file:$VIDEO_PATH" \
  -vf "subtitles=subtitles.ass:force_style='FontSize=22,Bold=1,PrimaryColour=&H0000deff,OutlineColour=&H00000000,Outline=2,MarginV=30'" \
  -c:v libx264 -preset fast -crf 18 \
  -c:a copy \
  "file:output_with_subtitles.mp4"
```

---

## 数据格式

### subtitles_with_time.json

```json
[
  {
    "text": "大家好",
    "start": 0.12,
    "end": 1.50,
    "words": [
      {"text": "大", "start": 0.12, "end": 0.30},
      {"text": "家", "start": 0.30, "end": 0.60},
      {"text": "好", "start": 0.60, "end": 1.50}
    ]
  }
]
```

---

## 配置

### 词典（热词）

词典文件位于 `字幕/词典.txt`，每行一个词：

```
skills
Claude
iPhone
```

添加新词：直接编辑词典.txt，下次转录自动生效。
