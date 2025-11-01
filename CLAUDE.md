# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js audio transcription application that supports both local files and YouTube content. It uses Whisper models for transcription (both local and cloud-based via Groq API) with intelligent audio splitting, batch processing, and playlist support.

## Development Commands

**Core Development:**
- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

**Testing:**
- `npm run test:batch` - Test batch processing system with simple test
- `npm run test:batch:verbose` - Test batch processing with verbose output (uses --mock flag)
- No formal unit test suite exists. Test manually using the web interface with various audio files and YouTube URLs.

## Architecture Overview

### App Structure (Next.js App Router)
- **Frontend**: React components in `src/components/` with shadcn/ui + Tailwind CSS
- **Backend**: API routes in `src/app/api/` handling transcription, YouTube extraction, and file management
- **State**: Zustand store for batch queue management (`src/store/batchQueueStore.ts`)
- **Types**: Centralized in `src/types/index.ts`

### Core Data Flow
1. **Input Sources**: Local file upload or YouTube URL (including playlists)
2. **Processing**: Audio extraction → optional splitting → transcription
3. **Output**: Timestamped segments with multiple display modes

### Key Services
- **`src/services/whisper.ts`**: Local Whisper execution with Apple Silicon GPU support
- **`src/services/api-client.ts`**: Client-side API calls and Groq cloud service
- **`src/services/youtube.ts`**: YouTube metadata and playlist handling
- **`src/services/groq-batch-service.ts`**: Groq batch API integration with job lifecycle management
- **`src/services/transcription-service.ts`**: Unified transcription interface for all processing modes
- **`src/services/email-service.ts`**: SMTP-based email notifications for batch completion
- **`src/services/blob-cleanup-service.ts`**: Automatic cleanup of Vercel Blob storage

### Primary Components
- **`BatchTranscription`**: Main app orchestrator (default mode)
- **`BatchProcessor`**: Queue management with drag & drop
- **`YoutubeInput`**: YouTube URL handling with playlist detection
- **`AudioTranscription`**: Legacy single-file mode

## API Architecture

### Main Endpoints

**Transcription:**
- **`POST /api/transcribe`**: Core transcription (supports both local Whisper and Groq on-demand)
- **`POST /api/transcribe/youtube`**: YouTube video transcription endpoint

**Batch Processing:**
- **`POST /api/batch/submit`**: Submit new batch job
- **`GET /api/batch/list`**: List all batch jobs
- **`GET /api/batch/[jobId]/status`**: Get batch job status
- **`GET /api/batch/[jobId]/items`**: Get batch job items
- **`GET /api/batch/[jobId]/results`**: Download complete results package
- **`POST /api/batch/[jobId]/retry`**: Retry failed items in batch
- **`POST /api/batch/[jobId]/cancel`**: Cancel batch job
- **`DELETE /api/batch/[jobId]/delete`**: Delete batch job
- **`POST /api/batch/poller`**: Background polling for batch status updates
- **`POST /api/batch/cleanup-blobs`**: Clean up Vercel Blob storage

**YouTube:**
- **`POST /api/youtube/extract`**: YouTube audio extraction using yt-dlp
- **`GET /api/youtube/playlist`**: Playlist metadata and video listing
- **`GET /api/youtube/info`**: Get video metadata
- **`GET /api/youtube/audio`**: Stream YouTube audio

**Utilities:**
- **`POST /api/audio/split`**: Large file splitting for API limits
- **`POST /api/cleanup-temp`**: Temporary file cleanup
- **`POST /api/upload-for-batch`**: Upload audio files to Vercel Blob for batch processing

### Model Support
**Local Models**: `whisper-tiny`, `whisper-base`, `whisper-small`, `whisper-medium`
**Cloud Models**: `groq-distil-whisper`, `groq-whisper-large-v3-turbo`, `groq-whisper-large-v3`

## Important Patterns

### Processing Strategy Pattern
The application uses a strategy pattern for different processing modes:
- **`ProcessingStrategy`** interface in `src/strategies/processing-strategy.ts`
- **`OnDemandProcessor`**: Real-time processing with immediate results
- **`GroqBatchProcessor`**: Cost-effective batch processing (50% savings)
- **`ProcessingStrategyFactory`**: Dynamic strategy instantiation based on mode
- Each strategy implements: `canProcess()`, `processItems()`, `getStatusSummary()`, `stopProcessing()`

### Database Layer (SQLite)
- **Location**: `./data/transcriptor.db` (auto-created)
- **Library**: better-sqlite3 with WAL mode for concurrent access
- **Schema**: `src/lib/database.ts` with tables for `batch_jobs` and `batch_items`
- **Queries**: Pre-compiled prepared statements for performance
- **Lifecycle**: Automatic schema initialization on startup

### Large File Handling
- Files >10MB automatically split for Groq API compatibility
- Resumable processing with part-by-part completion tracking
- Uses `src/utils/audio-split-utils.ts` for intelligent segmentation
- Split audio segments maintain timestamp continuity

### Error Recovery
- **Local Whisper**: GPU (MPS) → CPU fallback with automatic detection
- **Batch processing**: Individual failures don't stop the queue
- **Split files**: Resume from last completed segment
- **Blob storage**: Automatic retry logic and cleanup on failure

### State Management
The `batchQueueStore` (Zustand) manages:
- Queue items with processing status (`EnhancedQueuedAudioItem` type)
- Resumable state for split files
- Real-time progress tracking with percentage calculations
- Drag-and-drop reordering with @dnd-kit

### File Organization
- **Components**: Reusable UI components (shadcn/ui) with consistent patterns
- **Services**: Business logic abstraction with interface-based design
- **Strategies**: Pluggable processing implementations using strategy pattern
- **Utils**: Pure functions for audio, time, and download operations
- **API Routes**: Server-side processing with proper error handling and logging

## Environment Requirements

**Required Environment Variables:**
```bash
# Groq API (required for cloud models and batch processing)
GROQ_API_KEY=your_groq_api_key_here
GROQ_API_BASE_URL=https://api.groq.com/openai/v1

# Vercel Blob Storage (required for batch processing)
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token

# Email Notifications (optional, for batch completion alerts)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
NOTIFICATION_EMAIL=recipient@example.com

# Local Whisper Configuration (optional, defaults shown)
WHISPER_LOCAL_MODELS=tiny,base,small,medium
```

**System Dependencies:**
- **Node.js** 18+ (required)
- **Python** with `openai-whisper` package (for local models)
- **FFmpeg and FFprobe** in system PATH (required for all audio processing)
- **yt-dlp** for YouTube extraction (auto-installed via npm package)

## Common Tasks

**Adding New Transcription Models:**
1. Update model definitions in `src/services/api-client.ts`
2. Add model handling in `/api/transcribe` route
3. Update UI model selector components

**Modifying Audio Processing:**
- Audio utilities: `src/utils/audio-utils.ts`
- Splitting logic: `src/utils/audio-split-utils.ts`  
- API route: `/api/audio/split`

**Extending YouTube Support:**
- Core service: `src/services/youtube.ts`
- API routes: `/api/youtube/*`
- UI component: `src/components/youtube-input.tsx`

**Adding New Processing Strategy:**
1. Create new strategy class extending `BaseProcessingStrategy` in `src/strategies/`
2. Implement required methods: `canProcess()`, `processItems()`, `stopProcessing()`, `getConfigOptions()`
3. Register in `ProcessingStrategyFactory.create()` method
4. Update UI to support new processing mode

**Working with Batch Jobs:**
- Database operations: Use prepared statements from `batchJobQueries` and `batchItemQueries`
- Job lifecycle: `preparing` → `uploading` → `submitted` → `processing` → `completed/failed`
- Polling: Background poller checks Groq API every 30s for batch status updates
- Cleanup: Automatic blob deletion after job completion (configurable retention)

## Cursor Configuration

This project uses Cursor-specific rules in `.cursor/rules/`:

### Plan/Act Mode (core.mdc)
- **Plan Mode**: Research and plan changes without modifying files (default)
- **Act Mode**: Execute changes after plan approval
- Switch modes: User types `ACT` to approve plan or `PLAN` to return to planning
- Always output current mode at the beginning of each response

### Memory Bank System (memory-bank.mdc)
- Core files: `projectbrief.md`, `productContext.md`, `activeContext.md`, `systemPatterns.md`, `techContext.md`, `progress.md`
- Located in `memory-bank/` directory (currently deleted - need to be recreated if using this system)
- Update when: discovering patterns, after significant changes, or when user requests with **update memory bank**
- `.cursor/rules` serves as project intelligence journal for learned patterns

**Note**: The memory bank files have been deleted from this project. The system is documented but not currently in use.