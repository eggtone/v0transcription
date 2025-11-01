# Server Module - Backend Development Guide

This guide is for working on the **server/** module - API routes, services, and business logic.

## What's in This Module

All server-side code:
- API route handlers (`src/api/`)
- Business services (`src/services/`)
- Processing strategies (`src/strategies/`)
- Database layer (`src/database/`)
- Server utilities (`src/lib/`)

## Import Rules

✅ **Can import:**
- `@shared/types` - Type definitions
- `@server/*` - Other server code
- Node.js built-ins (`fs`, `path`, `child_process`, etc.)

❌ **Cannot import:**
- `@client/*` - Client code (enforced by TypeScript)
- Browser APIs (DOM, window, localStorage, etc.)

## Architecture

### API Routes

**Location:** `src/api/`

**Pattern:** Next.js 15 App Router API routes

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { TranscriptionService } from '@server/services/transcription-service';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    const result = await TranscriptionService.transcribe(file);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

### Services Layer

**Location:** `src/services/`

**Purpose:** Encapsulate external service integrations and business logic

```
services/
├── whisper.ts                  # Local Whisper execution (Python)
├── groq-batch-service.ts       # Groq batch API client
├── transcription-service.ts    # Unified transcription interface
├── youtube.ts                  # yt-dlp wrapper
├── email-service.ts            # SMTP notifications
├── notification-service.ts     # Notification abstraction
├── blob-cleanup-service.ts     # Vercel Blob management
└── batch-poller.ts             # Background batch status poller
```

**Pattern: Service Classes**

```typescript
export class WhisperService {
  static async transcribe(
    audioPath: string,
    options: WhisperOptions
  ): Promise<WhisperResult> {
    // Spawn Python Whisper process
    // Handle GPU fallback
    // Parse JSON output
  }
}
```

### Processing Strategies

**Location:** `src/strategies/`

**Pattern:** Strategy pattern for different processing modes

```typescript
interface ProcessingStrategy {
  canProcess(model: string): boolean;
  processItems(items: QueuedAudioItem[]): Promise<void>;
  getStatusSummary(): StatusSummary;
  stopProcessing(): void;
}

class OnDemandProcessor implements ProcessingStrategy {
  // Real-time processing, immediate results
}

class GroqBatchProcessor implements ProcessingStrategy {
  // Batch API, 50% cost savings, async results
}
```

**Factory:**
```typescript
class ProcessingStrategyFactory {
  static create(mode: ProcessingMode): ProcessingStrategy {
    // Return appropriate strategy
  }
}
```

### Database Layer

**Location:** `src/database/`

**Technology:** SQLite with better-sqlite3

```
database/
├── index.ts       # Exports initDatabase(), getDb()
├── schema.ts      # Table definitions
└── queries.ts     # Prepared statements
```

**Usage:**
```typescript
import { db } from '@server/database';

// Prepared statements
const insert = db.prepare(`
  INSERT INTO batch_jobs (id, status, created_at)
  VALUES (?, ?, ?)
`);

insert.run(jobId, 'pending', Date.now());
```

**Tables:**
- `batch_jobs` - Job metadata, status, timestamps
- `batch_items` - Individual items, transcription results

**Connection:**
- WAL mode for concurrent access
- Auto-initialized on first use
- Located at `./data/transcriptor.db`

### Server Utilities

**Location:** `src/lib/`

```
lib/
├── audio-utils.ts           # FFmpeg operations
├── audio-split-utils.ts     # Large file splitting
├── transcription-utils.ts   # Transcription helpers
├── time-utils.ts            # Server-side time handling
└── logger.ts                # Pino logger
```

## Common Patterns

### Error Handling

```typescript
import logger from '@server/lib/logger';

export async function POST(req: NextRequest) {
  const requestId = uuidv4();
  const log = logger.child({ requestId });

  try {
    log.info('Processing request');
    // ... logic
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error({ error }, 'Request failed');
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

### File Processing

```typescript
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Create temp file
const tempDir = path.join(os.tmpdir(), 'transcriptor-temp');
await fs.mkdir(tempDir, { recursive: true });

const tempFile = path.join(tempDir, `${uuidv4()}.mp3`);
await fs.writeFile(tempFile, buffer);

// Process...

// Clean up
await fs.unlink(tempFile);
```

### FFmpeg Operations

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function getAudioDuration(filePath: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration ` +
    `-of default=noprint_wrappers=1:nokey=1 "${filePath}"`
  );
  return parseFloat(stdout);
}

export async function splitAudio(
  inputPath: string,
  outputPath: string,
  startTime: number,
  duration: number
): Promise<void> {
  await execAsync(
    `ffmpeg -i "${inputPath}" -ss ${startTime} -t ${duration} ` +
    `-acodec copy "${outputPath}"`
  );
}
```

### Local Whisper Execution

```typescript
import { spawn } from 'child_process';

export async function executeWhisper(
  audioPath: string,
  model: string
): Promise<WhisperResult> {
  const args = [
    '-m', 'whisper',
    audioPath,
    '--model', model,
    '--output_format', 'json',
    '--device', 'mps' // Apple Silicon GPU
  ];

  const process = spawn('python3', args);

  // Handle stdout, stderr
  // Parse JSON output
  // GPU fallback on error
}
```

### Groq API Integration

```typescript
import OpenAI from 'openai';

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: process.env.GROQ_API_BASE_URL
});

// On-demand transcription
const transcription = await groq.audio.transcriptions.create({
  file: audioFile,
  model: 'whisper-large-v3',
  language: 'en'
});

// Batch API
const batch = await groq.batches.create({
  input_file_id: fileId,
  endpoint: '/v1/audio/transcriptions',
  completion_window: '24h'
});
```

### YouTube Integration

```typescript
import YTDlpWrap from 'yt-dlp-wrap';

const ytDlp = new YTDlpWrap();

// Extract audio
await ytDlp.execPromise([
  videoUrl,
  '-x',                        // Extract audio
  '--audio-format', 'mp3',
  '--audio-quality', '192',
  '-o', outputPath
]);

// Get metadata
const info = await ytDlp.getVideoInfo(videoUrl);
```

## API Endpoint Structure

### Transcription Endpoints

```
POST /api/transcribe
  - Single file transcription (local or Groq on-demand)

POST /api/transcribe/youtube
  - YouTube video transcription
```

### Batch Processing Endpoints

```
POST /api/batch/submit
  - Submit new batch job (Groq Batch API)

GET /api/batch/list
  - List all batch jobs

GET /api/batch/[jobId]/status
  - Get job status

GET /api/batch/[jobId]/items
  - Get job items with transcription results

GET /api/batch/[jobId]/results
  - Download complete results package (ZIP)

POST /api/batch/[jobId]/retry
  - Retry failed items

POST /api/batch/[jobId]/cancel
  - Cancel running job

DELETE /api/batch/[jobId]/delete
  - Delete job and cleanup storage

POST /api/batch/poller
  - Background poller for status updates

POST /api/batch/cleanup-blobs
  - Clean up old Vercel Blob files
```

### YouTube Endpoints

```
POST /api/youtube/extract
  - Extract audio from YouTube video

GET /api/youtube/playlist
  - Get playlist metadata and videos

GET /api/youtube/info
  - Get video metadata

GET /api/youtube/audio
  - Stream YouTube audio
```

### Utility Endpoints

```
POST /api/audio/split
  - Split large audio files

POST /api/upload-for-batch
  - Upload audio to Vercel Blob for batch

POST /api/cleanup-temp
  - Clean up temporary files

POST /api/send-notification
  - Send email notification
```

## Environment Variables

**Required:**
```bash
GROQ_API_KEY=gsk_...
GROQ_API_BASE_URL=https://api.groq.com/openai/v1
BLOB_READ_WRITE_TOKEN=vercel_blob_...
```

**Optional:**
```bash
# Email notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
NOTIFICATION_EMAIL=recipient@example.com

# Local Whisper
WHISPER_LOCAL_MODELS=tiny,base,small,medium
```

## Common Tasks

### Add a New API Endpoint

1. Create route file in `src/api/[endpoint]/route.ts`
2. Import types from `@shared/types`
3. Implement POST/GET/DELETE handlers
4. Add error handling and logging
5. Update client API client

### Add a New Service

1. Create service file in `src/services/`
2. Export class or functions
3. Document with JSDoc comments
4. Add error handling
5. Use logger for debugging

### Modify Database Schema

1. Update `src/database/schema.ts`
2. Add migration logic in `initDatabase()`
3. Update queries in `src/database/queries.ts`
4. Test with existing database

### Add Processing Strategy

1. Create class in `src/strategies/`
2. Implement `ProcessingStrategy` interface
3. Register in `ProcessingStrategyFactory`
4. Update UI to expose new mode

## Testing

**Batch System Tests:**
```bash
npm run test:batch           # Simple test
npm run test:batch:verbose   # With mock flag
```

**Manual Testing:**
- Test API endpoints with Postman/curl
- Check database with DB Browser for SQLite
- Monitor logs with pino-pretty

## Common Pitfalls

❌ **Don't:**
- Import from `@client/*`
- Use browser APIs (DOM, window, etc.)
- Forget to clean up temp files
- Skip error logging
- Hardcode file paths

✅ **Do:**
- Use logger for all operations
- Clean up temp files in finally blocks
- Validate all inputs with Zod
- Use prepared statements for database
- Handle GPU fallback for local Whisper

## Service Dependencies

```
API Routes
  ↓
TranscriptionService
  ├─ WhisperService (local models)
  ├─ GroqBatchService (batch API)
  └─ YouTubeService (audio extraction)
       ├─ FFmpeg (audio processing)
       └─ yt-dlp (YouTube download)
```

## Next Steps

- See `../client/CLAUDE.md` for frontend development
- See `../shared/CLAUDE.md` for type definitions
- Check `../CLAUDE.md` for project overview
