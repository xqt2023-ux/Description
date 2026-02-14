# Descript Clone

A web-based video editor that lets you edit video like editing a document. Built with Next.js, Express, and FFmpeg.

## 🚀 Features

- **Text-Based Editing**: Edit video by editing the transcript
- **AI Transcription**: Automatic speech-to-text with word-level timestamps
- **Timeline Editor**: Multi-track timeline with drag & drop editing
- **Screen Recording**: Record screen, camera, and microphone
- **Export**: Multiple formats and resolutions

## 📁 Project Structure

```
descript-clone/
├── frontend/          # Next.js frontend application
├── backend/           # Express.js backend API
└── shared/            # Shared TypeScript types
```

## 🛠️ Tech Stack

### Frontend

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS** (Styling)
- **Zustand** (State Management with undo/redo)
- **React Query** (Data Fetching)
- **Slate.js** (Rich Text Editor)

### Backend

- **Node.js + Express**
- **TypeScript**
- **FFmpeg** (Video/Audio Processing)
- **AI Services**:
  - **Anthropic Claude** (Text analysis, filler word removal, summarization)
  - **Groq Whisper** (Fast, free transcription - primary)
  - **OpenAI Whisper** (Backup transcription)
- **node-edge-tts** (Text-to-Speech)
- **BullMQ + Redis** (Job Queue - configured, not yet used)
- **PostgreSQL** (Database - configured, not yet used)
- **Drizzle ORM** (Type-safe database queries)

## 🏁 Getting Started

### Prerequisites

- **Node.js 18+**
- **FFmpeg** (必须安装，用于视频处理)
  - Windows: 下载 [FFmpeg](https://ffmpeg.org/download.html) 并添加到 PATH
  - Mac: `brew install ffmpeg`
  - Linux: `sudo apt-get install ffmpeg`
- **API Keys** (至少需要一个转录服务):
  - **Groq API Key** (推荐 - 免费且快速) - [获取](https://console.groq.com/keys)
  - **Anthropic Claude API Key** (用于AI功能) - [获取](https://console.anthropic.com/settings/keys)
  - **OpenAI API Key** (可选 - 备用转录) - [获取](https://platform.openai.com/api-keys)
- **PostgreSQL** (可选，当前未使用)
- **Redis** (可选，当前未使用)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/descript-clone.git
cd descript-clone
```

2. Install frontend dependencies:
```bash
cd frontend
npm install
```

3. Install backend dependencies:
```bash
cd ../backend
npm install
```

4. Set up environment variables:

**后端配置:**
```bash
cd backend
cp .env.example .env
# 编辑 .env 文件，添加您的 API keys:
# - ANTHROPIC_API_KEY (必需)
# - GROQ_API_KEY (必需，用于转录)
# - OPENAI_API_KEY (可选)
```

**前端配置:**
```bash
cd ../frontend
cp .env.example .env.local
# 默认配置已经足够，除非您修改了后端端口
```

5. Start the development servers:

**Frontend:**
```bash
cd frontend
npm run dev
```

**Backend:**
```bash
cd backend
npm run dev
```

6. Open http://localhost:3000 in your browser

## 📝 Environment Variables

### Backend (.env)

#### 必需配置

| Variable | Description | 获取方式 |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Claude AI API key | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| `GROQ_API_KEY` | Groq Whisper API key (转录) | [console.groq.com](https://console.groq.com/keys) |
| `FFMPEG_PATH` | FFmpeg 可执行文件路径 | 安装后通常为 `ffmpeg` |
| `FFPROBE_PATH` | FFprobe 可执行文件路径 | 安装后通常为 `ffprobe` |

#### 可选配置

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | 服务器端口 | `3001` |
| `OPENAI_API_KEY` | OpenAI API key (备用转录) | - |
| `UPLOAD_DIR` | 上传文件目录 | `./uploads` |
| `EXPORT_DIR` | 导出文件目录 | `./exports` |
| `MAX_FILE_SIZE` | 最大文件大小 | `500MB` |
| `HTTP_PROXY` | HTTP 代理地址 (企业环境) | - |
| `HTTPS_PROXY` | HTTPS 代理地址 (企业环境) | - |
| `DATABASE_URL` | PostgreSQL 连接 (未使用) | - |
| `REDIS_URL` | Redis 连接 (未使用) | - |

### Frontend (.env.local)

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | 后端 API 地址 | `http://localhost:3001` |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
