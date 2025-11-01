# Audio Transcription App

A comprehensive Next.js application for audio transcription supporting both on-demand and batch processing with multiple AI models, YouTube integration, and advanced file management.

## ✨ Features

### 🎯 Multiple Processing Modes
- **On-Demand Processing**: Real-time transcription with immediate results
- **Batch Processing**: Submit multiple files for cost-effective processing (50% savings with Groq)
- **Queue Management**: Drag & drop interface with progress tracking

### 📁 Input Sources
- **Direct File Upload**: Support for various audio formats (MP3, WAV, M4A, etc.)
- **YouTube Integration**: 
  - Single video transcription
  - Playlist support with batch processing
  - Automatic audio extraction and quality optimization

### 🤖 AI Model Support

#### Local Models (via OpenAI Whisper)
- `whisper-tiny` - Fastest, basic accuracy
- `whisper-base` - Balanced speed and accuracy  
- `whisper-small` - Better accuracy
- `whisper-medium` - High accuracy (Apple Silicon GPU accelerated)

#### Cloud Models (via Groq API)
- `groq-distil-whisper` - Fast English-only processing
- `groq-whisper-large-v3` - Full multilingual support
- `groq-whisper-large-v3-turbo` - Fastest large model

### 📊 Advanced Features
- **Smart File Splitting**: Automatic handling of large files (>10MB) with intelligent segmentation
- **Batch Job Management**: Full lifecycle management with retry, cancel, and delete operations
- **Package Downloads**: Complete packages with audio files + transcriptions in multiple formats
- **Progress Tracking**: Real-time progress for all operations
- **Email Notifications**: Batch completion notifications
- **Storage Management**: Automatic cleanup of temporary files and Vercel Blob storage

### 🎛️ Transcription Display Modes
- **Compact**: Single paragraph view
- **Segments**: Line-by-line with timestamps  
- **Segments with Time**: Formatted timestamps `[MM:SS] text`
- **Interactive Editor**: Edit and export capabilities

## 🛠️ System Requirements

### Required Dependencies
- **Node.js** (v18+)
- **Python** (for local Whisper models)
- **FFmpeg & FFprobe** (for audio processing)
- **yt-dlp** (for YouTube extraction)

### Installation Commands

```bash
# Install Python dependencies
pip install openai-whisper

# Install FFmpeg (varies by OS)
# macOS:
brew install ffmpeg

# Ubuntu/Debian:
sudo apt update && sudo apt install ffmpeg

# Windows:
# Download from https://ffmpeg.org/download.html
```

## 🚀 Quick Start

### 1. Clone & Install
```bash
git clone <repository-url>
cd transcriptor
npm install
```

### 2. Environment Configuration
Create a `.env.local` file:

```env
# Required for Groq batch processing and cloud models
GROQ_API_KEY=your_groq_api_key_here
GROQ_API_BASE_URL=https://api.groq.com/openai/v1

# Required for Vercel Blob storage (batch processing)
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token

# Email notifications (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
NOTIFICATION_EMAIL=recipient@example.com

# Local Whisper configuration
WHISPER_LOCAL_MODELS=tiny,base,small,medium
```

### 3. Database Setup
The application uses SQLite with automatic setup:
```bash
# Database will be created automatically at ./data/transcriptor.db
# No manual setup required
```

### 4. Run Development Server
```bash
npm run dev
```

Visit `http://localhost:3000` to access the application.

## 📚 Usage Guide

### On-Demand Processing
1. Select "On-Demand" processing mode
2. Choose your preferred model
3. Upload files or enter YouTube URLs
4. Get real-time transcription results

### Batch Processing
1. Select "Batch" processing mode  
2. Choose Groq model (required for batch)
3. Add multiple files to the queue
4. Set completion window (24h or 7d)
5. Submit batch job
6. Monitor progress in Batch Job Manager
7. Download complete packages when ready

### YouTube Playlists
1. Enter a YouTube playlist URL
2. Confirm playlist processing
3. All videos will be added to the queue
4. Process individually or as a batch

## 🏗️ Architecture

### Core Components
- **Next.js 15**: App Router with React Server Components
- **TypeScript**: Full type safety
- **SQLite**: Local database with better-sqlite3
- **Zustand**: State management for queue operations
- **Tailwind CSS**: Styling with shadcn/ui components

### Processing Strategies
- **Strategy Pattern**: Pluggable processing architectures
- **On-Demand Processor**: Real-time processing with immediate results
- **Groq Batch Processor**: Cost-effective batch processing with 50% savings

### File Management
- **Vercel Blob Storage**: Public file hosting for batch processing
- **Automatic Cleanup**: Temporary file and blob storage management
- **Smart Segmentation**: Intelligent audio splitting for large files

## 🔧 Configuration

### Model Configuration
Models are configured in the environment and can be customized per processing mode:

```typescript
// Local models (on-demand only)
const localModels = ['whisper-tiny', 'whisper-base', 'whisper-small', 'whisper-medium'];

// Groq models (both on-demand and batch)
const groqModels = ['groq-distil-whisper', 'groq-whisper-large-v3', 'groq-whisper-large-v3-turbo'];
```

### Batch Processing Settings
- **Completion Window**: 24 hours or 7 days
- **File Size Limit**: 10MB per file (auto-split for larger files)
- **Concurrent Processing**: Optimized for Groq's batch API limits

## 📁 Project Structure

```
src/
├── app/api/           # API routes
│   ├── batch/         # Batch processing endpoints
│   ├── transcribe/    # Transcription endpoints
│   └── youtube/       # YouTube integration
├── components/        # React components
│   ├── ui/           # shadcn/ui components
│   └── batch-*       # Batch processing components
├── services/         # Business logic
│   ├── groq-batch-service.ts
│   ├── whisper.ts
│   └── youtube.ts
├── strategies/       # Processing strategies
├── store/           # Zustand state management
├── utils/           # Utility functions
└── types/           # TypeScript definitions
```

## 🔒 Security & Privacy

### Data Handling
- **Local Processing**: Files processed locally never leave your machine
- **Batch Processing**: Files temporarily stored in Vercel Blob, automatically cleaned up
- **No Persistent Storage**: Audio files not permanently stored on servers

### API Keys
- Store all API keys in `.env.local` (never commit to repository)
- Use environment variables for all sensitive configuration
- Rotate keys regularly for security

## 🚨 Troubleshooting

### Common Issues

**FFmpeg not found**
```bash
# Verify installation
ffmpeg -version
ffprobe -version

# If not found, install via package manager
```

**Groq API errors**
```bash
# Check API key in .env.local
# Verify GROQ_API_KEY is valid
# Check Groq dashboard for usage limits
```

**Batch processing fails**
```bash
# Ensure BLOB_READ_WRITE_TOKEN is configured
# Check Vercel Blob storage permissions
# Verify files are under 10MB (or auto-splitting is working)
```

**Local Whisper fails**
```bash
# Check Python installation
python --version

# Verify openai-whisper installation
pip list | grep openai-whisper

# Try smaller model first (whisper-tiny)
```

## 🛣️ Roadmap

- [ ] Additional cloud model providers (OpenAI, Azure)
- [ ] Real-time streaming transcription
- [ ] Multi-language detection and processing
- [ ] Advanced audio preprocessing
- [ ] Custom model fine-tuning support
- [ ] API rate limiting and quotas
- [ ] User authentication and multi-tenancy

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- [OpenAI Whisper](https://github.com/openai/whisper) for local transcription models
- [Groq](https://groq.com/) for fast cloud inference
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) for YouTube audio extraction
- [Next.js](https://nextjs.org/) for the application framework
- [Vercel](https://vercel.com/) for hosting and blob storage