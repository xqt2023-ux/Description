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
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Zustand (State Management)
- React Query (Data Fetching)
- Slate.js (Rich Text Editor)

### Backend
- Node.js + Express
- TypeScript
- FFmpeg (Video Processing)
- OpenAI Whisper (Transcription)
- PostgreSQL + Redis (Data Storage)

## 🏁 Getting Started

### Prerequisites

- Node.js 18+
- FFmpeg installed
- PostgreSQL (optional, for production)
- Redis (optional, for job queue)

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
```bash
cp .env.example .env
# Edit .env with your configuration
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

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `REDIS_URL` | Redis connection string | - |
| `OPENAI_API_KEY` | OpenAI API key for Whisper | - |
| `UPLOAD_DIR` | Directory for uploaded files | `./uploads` |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
