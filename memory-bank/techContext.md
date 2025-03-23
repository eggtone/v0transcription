# Technical Context

## Technology Stack

### Frontend
- **Framework**: Next.js 15.2.0
- **UI Library**: React 19.0.0
- **Styling**: Tailwind CSS 4.x
- **UI Components**: Custom components with Radix UI primitives
- **Notifications**: Sonner 2.0.1
- **Icons**: Lucide React 0.477.0

### Backend (API Routes)
- **Runtime**: Node.js on Next.js API routes
- **File Handling**: Node.js fs module
- **HTTP Client**: Axios 1.8.1

### External Services
- **Transcription**: 
  - Local: OpenAI Whisper (via Python)
  - Cloud: Groq API (via OpenAI-compatible client)
- **YouTube Integration**:
  - yt-dlp-wrap 2.3.12
  - youtube-dl-exec 3.0.16
  - ytdl-core 4.11.5

### Development Tools
- **Package Manager**: npm (with bun.lock file indicating Bun usage)
- **TypeScript**: TypeScript 5.x
- **Linting**: ESLint 9.x
- **Code Formatting**: Implicit (likely Prettier)

## Environment Setup

### Environment Variables
The application requires the following environment variables:

```
# API Keys
OPENAI_API_KEY=your_openai_api_key_here
GROQ_API_KEY=your_groq_api_key_here

# API Base URLs
GROQ_API_BASE_URL=https://api.groq.com/openai/v1

# Local Whisper Settings
WHISPER_LOCAL_MODELS=tiny,base,small,medium
```

### Required External Dependencies
- **Python**: For running Whisper models locally
- **OpenAI Whisper**: Installed via pip
- **FFmpeg**: Required by Whisper for audio processing

## Architecture Details

### Directory Structure
```
/src
  /app            # Next.js App Router structure
    /api          # API routes
      /transcribe # Transcription endpoints
      /summarize  # Summarization endpoint
      /youtube    # YouTube extraction endpoints
    /globals.css  # Global styles
    /layout.tsx   # Root layout
    /page.tsx     # Main page
  /components     # React components
    /ui           # Reusable UI components
  /services       # Service layer for external APIs
    /prompts      # Prompt templates for AI services
  /types          # TypeScript type definitions
  /utils          # Utility functions
/public           # Static assets
/whisper_mps.py   # Custom Whisper script for Apple Silicon GPU support
```

### API Routes
1. **Transcription API**
   - `/api/transcribe`: Handles file transcription
   - `/api/transcribe/youtube`: Transcribes YouTube audio

2. **YouTube API**
   - `/api/youtube/extract`: Extracts audio from YouTube videos
   - `/api/youtube/audio/[videoId]`: Serves extracted audio
   - `/api/youtube/proxy`: Proxy for YouTube requests

3. **Summarization API**
   - `/api/summarize`: Generates summaries of transcription text

### Component Architecture
1. **Core Components**
   - `AudioTranscription`: Main component orchestrating the application
   - `AudioPlayer`: Audio playback with controls
   - `TranscriptionDisplay`: Displays transcription in various formats
   - `TranscriptionSummarization`: Handles summarization of transcription

2. **UI Components**
   - Buttons, cards, inputs, labels, selects, sliders, etc.
   - Based on Radix UI primitives with Tailwind styling

## Technical Decisions

### Local Whisper Implementation
The application implements a hybrid approach to running Whisper:
- Uses Python subprocess to call Whisper CLI
- Custom `whisper_mps.py` script for Apple Silicon GPU support
- Fallback to CPU if GPU processing fails
- JSON output format to preserve accurate timestamps

### Groq API Integration
- Uses the OpenAI-compatible client libraries
- Implements retry and fallback mechanisms
- Supports multiple Whisper models through Groq

### YouTube Integration
- Uses multiple libraries for robust YouTube handling
- Implements caching and temporary storage for efficiency
- Extracts audio server-side to avoid browser limitations

### Error Handling Strategy
- Timeouts for long-running processes
- Detailed error messages for debugging
- Graceful degradation when services fail
- User-friendly error messages in the UI

## Technical Constraints

1. **Whisper Model Sizes**
   - Whisper models range from ~150MB (tiny) to ~6GB (large)
   - Local processing is limited to tiny, base, small, and medium models
   - Large models require the Groq API

2. **Processing Performance**
   - Local transcription performance varies by hardware
   - GPU acceleration available for Apple Silicon (experimental)
   - Long audio files may hit timeout limits

3. **Browser Limitations**
   - Audio file size limits
   - Web Audio API compatibility
   - YouTube extraction requires server-side processing

4. **API Rate Limits**
   - Groq API has rate limits
   - YouTube extraction may be subject to quotas

5. **Development Environment**
   - Requires Python setup for local Whisper
   - Node.js and npm for JavaScript dependencies 