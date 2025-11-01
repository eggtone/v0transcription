# CLAUDE.md Files Plan

## Overview

Create context-specific CLAUDE.md files for different parts of the codebase to give AI agents (Claude Code) targeted guidance based on what they're working on.

---

## File Structure

```
v0transcription/
├── CLAUDE.md                    # Root: Project overview & navigation
├── client/
│   └── CLAUDE.md               # Frontend development guidance
├── server/
│   └── CLAUDE.md               # Backend development guidance
└── shared/
    └── CLAUDE.md               # Type definition guidance
```

---

## Root CLAUDE.md

**Purpose:** High-level overview and navigation to specialized contexts

**Contents:**

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js audio transcription application with batch processing, YouTube integration, and multiple AI model support. The codebase is organized into three main modules:

- **`client/`** - Frontend React/Next.js code (see `client/CLAUDE.md`)
- **`server/`** - Backend API and services (see `server/CLAUDE.md`)
- **`shared/`** - Shared TypeScript types (see `shared/CLAUDE.md`)

## Quick Start

```bash
# Development
npm run dev

# Build
npm run build

# Tests
npm run test:batch
npm run test:batch:verbose
```

## Architecture

This is a **modular monorepo** with clear separation:

```
┌─────────────────────────────────────────┐
│  Browser (client/)                      │
│  ├─ React Components                    │
│  ├─ Zustand Store                       │
│  └─ API Calls ──────────────┐          │
└─────────────────────────────│───────────┘
                              │
                              ▼
┌─────────────────────────────────────────┐
│  Next.js API Routes (server/)           │
│  ├─ Business Logic (services/)          │
│  ├─ Database (SQLite)                   │
│  ├─ External APIs (Groq, YouTube)       │
│  └─ Processing Strategies               │
└─────────────────────────────────────────┘
                              │
                              ▼
                   ┌──────────────────┐
                   │  shared/types/   │
                   └──────────────────┘
```

## Module Boundaries

**IMPORTANT: Import rules enforced by TypeScript:**

- `client/` can import: `shared/types`, other `client/` files
- `server/` can import: `shared/types`, other `server/` files
- `shared/` imports: NOTHING (types only, no implementations)
- **client/ CANNOT import server/** (will fail TypeScript)
- **server/ CANNOT import client/** (will fail TypeScript)

## Working on Different Parts

### Frontend Work (UI, Components, State)
**Read:** `client/CLAUDE.md` for detailed frontend guidance
**Location:** `client/src/`

### Backend Work (API, Database, Services)
**Read:** `server/CLAUDE.md` for detailed backend guidance
**Location:** `server/src/`

### Type Definitions
**Read:** `shared/CLAUDE.md` for type definition patterns
**Location:** `shared/types/`

## Core Technologies

- **Frontend:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, shadcn/ui, Zustand
- **Backend:** Node.js, Next.js API Routes, SQLite (better-sqlite3)
- **Processing:** Local Whisper (Python), Groq API, FFmpeg
- **External Services:** YouTube (yt-dlp), Vercel Blob Storage

## Key Patterns

### Strategy Pattern (Backend)
Processing modes use the strategy pattern:
- `OnDemandProcessor` - Real-time transcription
- `GroqBatchProcessor` - Batch API with 50% cost savings

See: `server/src/strategies/`

### State Management (Frontend)
Zustand store manages batch queue state:
- Queue items with drag & drop ordering
- Real-time progress tracking
- Resumable processing for split files

See: `client/src/stores/batchQueueStore.ts`

### Database (Backend)
SQLite with WAL mode for concurrent access:
- `batch_jobs` - Job metadata and status
- `batch_items` - Individual items in each job

See: `server/src/database/`

## Environment Variables

Required:
- `GROQ_API_KEY` - Groq API for cloud transcription
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob for batch storage

Optional:
- `SMTP_*` - Email notifications
- `WHISPER_LOCAL_MODELS` - Local model configuration

See: `.env.example`

## Common Tasks

**Add a new UI component:**
→ Work in `client/src/components/`, read `client/CLAUDE.md`

**Add a new API endpoint:**
→ Work in `server/src/api/`, read `server/CLAUDE.md`

**Add a new type:**
→ Work in `shared/types/`, read `shared/CLAUDE.md`

**Modify transcription logic:**
→ Work in `server/src/services/whisper.ts` or `groq-batch-service.ts`

**Modify UI state:**
→ Work in `client/src/stores/batchQueueStore.ts`

## Testing

- **Manual:** Use the web interface at `http://localhost:3000`
- **Batch System:** `npm run test:batch` or `npm run test:batch:verbose`
- **Build Test:** `npm run build` (catches TypeScript errors)

## Notes for Claude Code

1. **Always check which module you're in** (client, server, or shared)
2. **Read the module-specific CLAUDE.md** for detailed guidance
3. **Respect import boundaries** - TypeScript will enforce these
4. **Types go in shared/** even if only used by one module (for future flexibility)
5. **When in doubt about module boundary,** ask the user
```

---

## Client CLAUDE.md

**Purpose:** Frontend-specific development guidance

**Location:** `client/CLAUDE.md`

**Contents:**

```markdown
# Client Module - Frontend Development Guide

This guide is for working on the **client/** module - the React/Next.js frontend.

## What's in This Module

All browser-side code:
- React components (`src/components/`)
- Next.js pages (`src/app/`)
- Client state management (`src/stores/`)
- UI utilities (`src/lib/`)
- Styles and assets

## Import Rules

✅ **Can import:**
- `@shared/types` - Type definitions
- `@/*` - Other client code

❌ **Cannot import:**
- `@server/*` - Server code (enforced by TypeScript)
- Node.js modules (`fs`, `path`, etc.)

## Architecture

### Component Structure

```
src/components/
├── ui/                          # shadcn/ui base components
├── batch-transcription.tsx      # Main app orchestrator
├── batch-processor.tsx          # Queue UI with drag & drop
├── batch-job-manager.tsx        # Batch job dashboard
├── audio-queue-manager.tsx      # Queue controls & progress
├── youtube-input.tsx            # YouTube URL input & playlist
├── transcription-display.tsx    # Results display
├── transcription-editor.tsx     # Edit & export transcriptions
└── audio-player.tsx             # Audio playback controls
```

### State Management

**Zustand Store:** `src/stores/batchQueueStore.ts`

```typescript
interface BatchQueueStore {
  audioQueue: EnhancedQueuedAudioItem[];
  selectedModel: string;
  isProcessingBatch: boolean;
  currentProcessingId: string | null;

  // Actions
  addItem: (item: QueuedAudioItem) => void;
  updateItem: (id: string, updates: Partial<EnhancedQueuedAudioItem>) => void;
  removeItem: (id: string) => void;
  reorderItems: (newOrder: EnhancedQueuedAudioItem[]) => void;
  // ... more actions
}
```

**Key Features:**
- Persistent queue (localStorage)
- Drag & drop reordering (@dnd-kit/sortable)
- Progress tracking per item
- Resume support for split files

### API Communication

**Pattern:** All API calls in `src/lib/api-client.ts`

```typescript
// Example: Transcribe audio
export async function transcribeAudio(
  source: File,
  model: string,
  language: string = 'en'
): Promise<DetailedTranscription> {
  const formData = new FormData();
  formData.append("file", source);
  formData.append("model", model);

  const response = await fetch("/api/transcribe", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return await response.json();
}
```

**Never:**
- Don't implement business logic in components
- Don't directly access databases
- Don't run FFmpeg or system commands
- Don't use Node.js file system APIs

## Component Patterns

### Processing Progress

```typescript
// Use toast for feedback
import { toast } from "sonner";

toast.loading("Processing audio...");
toast.success("Transcription complete!");
toast.error("Failed to process audio");
```

### File Upload

```typescript
// Use react-dropzone for file handling
import { useDropzone } from 'react-dropzone';

const { getRootProps, getInputProps } = useDropzone({
  accept: { 'audio/*': ['.mp3', '.wav', '.m4a'] },
  onDrop: handleFiles
});
```

### Audio Playback

```typescript
// Use HTML5 Audio API
const audioRef = useRef<HTMLAudioElement>(null);

<audio ref={audioRef} src={audioUrl} />
```

## Styling

**Tailwind CSS** with **shadcn/ui** components

```typescript
// Use cn() utility for conditional classes
import { cn } from "@/lib/utils";

<div className={cn(
  "base-classes",
  isActive && "active-classes",
  disabled && "disabled-classes"
)} />
```

**shadcn/ui components** in `src/components/ui/`
- Pre-built, accessible components
- Customized via Tailwind classes
- Source code included (not package dependency)

## Common Tasks

### Add a New Component

1. Create file in `src/components/`
2. Import shared types: `import { Type } from '@shared/types';`
3. Use shadcn/ui components from `@/components/ui/`
4. Add to parent component

### Add Queue Functionality

1. Open `src/stores/batchQueueStore.ts`
2. Add action to store interface
3. Implement using Zustand pattern
4. Use in component: `const { action } = useBatchQueueStore()`

### Call a New API Endpoint

1. Add function to `src/lib/api-client.ts`
2. Define request/response types in `@shared/types`
3. Use fetch with proper error handling
4. Return typed response

### Display Processing Progress

1. Use `<Progress>` component from shadcn/ui
2. Update progress via state (local or store)
3. Show elapsed time using `formatTime()` from `@/lib/time-utils`

## Available UI Components (shadcn/ui)

- `Button`, `Card`, `Input`, `Label`, `Select`
- `Progress`, `Slider`, `Switch`, `Tabs`
- `Dialog`, `AlertDialog`, `Badge`, `Checkbox`
- See `src/components/ui/` for full list

## Utilities

**Time Formatting:**
```typescript
import { formatTime, formatTimestamp } from '@/lib/time-utils';

formatTime(125); // "2:05"
formatTimestamp(125); // "[2:05]"
```

**Download Files:**
```typescript
import { triggerBrowserDownload } from '@/lib/download-utils';

triggerBrowserDownload(blob, 'filename.mp3', 'audio/mpeg');
```

## Testing

**Manual Testing:**
1. Start dev server: `npm run dev`
2. Open `http://localhost:3000`
3. Test with various audio files
4. Test YouTube URLs and playlists

**Check TypeScript:**
```bash
npm run build  # Catches type errors
```

## Common Pitfalls

❌ **Don't:**
- Import from `@server/*`
- Use Node.js APIs like `fs` or `path`
- Implement audio processing logic (use API)
- Store sensitive data in client state

✅ **Do:**
- Keep components focused and small
- Use types from `@shared/types`
- Handle errors gracefully with toast
- Show loading states during async operations
- Use semantic HTML and ARIA labels

## Component Relationships

```
App (page.tsx)
  └─ BatchTranscription
      ├─ AudioQueueManager
      │   ├─ YoutubeInput
      │   ├─ BatchProcessor (drag & drop queue)
      │   │   └─ BatchItemAudioPlayer
      │   └─ ProcessingModeSelector
      └─ BatchJobManager (batch API dashboard)
```

## Next Steps

- See `../server/CLAUDE.md` for backend development
- See `../shared/CLAUDE.md` for type definitions
- Check `../CLAUDE.md` for project overview
```

---

## Server CLAUDE.md

**Purpose:** Backend-specific development guidance

**Location:** `server/CLAUDE.md`

**Contents:**

```markdown
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
```

---

## Shared CLAUDE.md

**Purpose:** Type definition patterns and guidelines

**Location:** `shared/CLAUDE.md`

**Contents:**

```markdown
# Shared Module - Type Definitions Guide

This guide is for working on **shared/types/** - TypeScript type definitions used by both client and server.

## What's in This Module

**ONLY** TypeScript type definitions:
- Interfaces
- Types
- Enums
- Type guards (pure functions only)
- Validation schemas (Zod)

**NO implementations, NO side effects**

## Import Rules

✅ **Can import:**
- Other files in `shared/types`
- Type-only imports from external packages

❌ **Cannot import:**
- `@client/*` - Client code
- `@server/*` - Server code
- Any code with side effects

## Purpose

Shared types ensure **type safety across the client-server boundary**:
- API request/response contracts
- Database record shapes
- Business domain models
- Configuration interfaces

## File Organization

```
shared/types/
├── index.ts              # Re-exports all types
├── transcription.ts      # Transcription-related types
├── batch.ts              # Batch processing types
├── youtube.ts            # YouTube integration types
├── audio.ts              # Audio processing types
└── api.ts                # API request/response types
```

## Type Categories

### Domain Models

Core business entities:

```typescript
// transcription.ts
export interface TranscriptionSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  // Whisper metadata
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
}

export interface DetailedTranscription {
  text: string;
  segments: TranscriptionSegment[];
  language: string;
  processingTime?: number;
  usedGpu?: boolean;
}
```

### API Contracts

Request and response shapes:

```typescript
// api.ts
export interface TranscribeRequest {
  file: File | Buffer;
  model: string;
  language?: string;
}

export interface TranscribeResponse {
  transcription: DetailedTranscription;
  processingTime: number;
}

export interface ApiError {
  error: string;
  message?: string;
  statusCode: number;
}
```

### State Shapes

Application state interfaces:

```typescript
// batch.ts
export interface QueuedAudioItem {
  id: string;
  name: string;
  source: 'local' | 'youtube-video' | 'youtube-playlist';
  file: File | null;
  url: string | null;
  order: number;
  duration?: number;

  // Status tracking
  extractionStatus?: 'pending' | 'extracting' | 'completed' | 'failed';
  transcriptionStatus?: 'pending' | 'processing' | 'completed' | 'failed';

  // Results
  transcriptionData?: DetailedTranscription;
  transcriptionError?: string;
}

export interface EnhancedQueuedAudioItem extends QueuedAudioItem {
  // Enhanced with processing metadata
  parts?: AudioPart[];
  currentPart?: number;
  totalParts?: number;
  progress?: number;
}
```

### Configuration

System configuration types:

```typescript
// audio.ts
export type MP3Quality = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface AudioPart {
  partIndex: number;
  startTime: number;
  duration: number;
  file?: File;
  transcription?: DetailedTranscription;
}

export interface WhisperOptions {
  model: string;
  language?: string;
  device?: 'cpu' | 'cuda' | 'mps';
  outputFormat?: 'json' | 'txt' | 'srt' | 'vtt';
}
```

### Enums

```typescript
export enum ProcessingMode {
  OnDemand = 'on-demand',
  Batch = 'batch'
}

export enum TranscriptionModel {
  WhisperTiny = 'whisper-tiny',
  WhisperBase = 'whisper-base',
  WhisperSmall = 'whisper-small',
  WhisperMedium = 'whisper-medium',
  GroqDistilWhisper = 'groq-distil-whisper',
  GroqWhisperLargeV3 = 'groq-whisper-large-v3',
  GroqWhisperLargeV3Turbo = 'groq-whisper-large-v3-turbo'
}
```

## Type Guards

Pure functions for runtime type checking:

```typescript
export function isLocalModel(model: string): boolean {
  return model.startsWith('whisper-') && !model.startsWith('groq-');
}

export function isGroqModel(model: string): boolean {
  return model.startsWith('groq-');
}

export function isTranscriptionComplete(
  item: QueuedAudioItem
): item is QueuedAudioItem & { transcriptionData: DetailedTranscription } {
  return item.transcriptionStatus === 'completed' && !!item.transcriptionData;
}
```

## Validation Schemas

Zod schemas for runtime validation:

```typescript
import { z } from 'zod';

export const TranscribeRequestSchema = z.object({
  model: z.enum([
    'whisper-tiny',
    'whisper-base',
    'groq-whisper-large-v3'
  ]),
  language: z.string().optional(),
});

export type TranscribeRequest = z.infer<typeof TranscribeRequestSchema>;
```

## Naming Conventions

**Interfaces:**
- PascalCase
- Descriptive noun phrases
- `I` prefix NOT used

```typescript
✅ DetailedTranscription
✅ QueuedAudioItem
❌ ITranscription
❌ TranscriptionInterface
```

**Types:**
- PascalCase for aliases
- Descriptive names

```typescript
✅ export type DisplayMode = "compact" | "segments" | "edit";
✅ export type ApiClient = ...
```

**Enums:**
- PascalCase for enum name
- PascalCase for enum values

```typescript
✅ export enum ProcessingMode {
  OnDemand = 'on-demand',
  Batch = 'batch'
}
```

## Documentation

All types should have JSDoc comments:

```typescript
/**
 * Represents a segment of transcribed audio with timestamp and metadata.
 *
 * Each segment corresponds to a logical chunk of speech, typically a sentence
 * or phrase, with precise start/end times and Whisper model metadata.
 */
export interface TranscriptionSegment {
  /** Unique identifier for this segment */
  id: number;

  /** Start time in seconds */
  start: number;

  /** End time in seconds */
  end: number;

  /** Transcribed text for this segment */
  text: string;

  /** Token IDs from the model (for debugging) */
  tokens: number[];

  /** Model temperature used for this segment */
  temperature: number;

  /** Average log probability (confidence score) */
  avg_logprob: number;

  /** Compression ratio (detects repetitive output) */
  compression_ratio: number;

  /** Probability that this segment contains no speech */
  no_speech_prob: number;
}
```

## Common Patterns

### Extending Types

```typescript
// Base type
export interface BaseItem {
  id: string;
  name: string;
}

// Extended with additional fields
export interface EnhancedItem extends BaseItem {
  metadata: Record<string, unknown>;
  createdAt: number;
}
```

### Union Types for Status

```typescript
export type Status =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

// Or with additional data
export type Result<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };
```

### Utility Types

```typescript
// Make all fields optional
export type PartialQueuedItem = Partial<QueuedAudioItem>;

// Pick specific fields
export type QueuedItemSummary = Pick<QueuedAudioItem, 'id' | 'name' | 'status'>;

// Omit fields
export type QueuedItemInput = Omit<QueuedAudioItem, 'id' | 'createdAt'>;
```

## Common Tasks

### Add a New Type

1. Determine correct file (transcription, batch, youtube, audio, api)
2. Define interface with JSDoc comments
3. Export from file
4. Re-export from `index.ts`

### Add a Type Guard

1. Define in same file as type
2. Use `is` type predicate
3. No side effects, pure function

### Add Validation Schema

1. Define Zod schema matching interface
2. Export both schema and inferred type
3. Use in API routes for validation

### Modify Existing Type

1. Check all usage in client and server
2. Make changes backward compatible if possible
3. Update documentation
4. Run TypeScript check: `npx tsc --noEmit`

## Testing Types

```bash
# Type check without emitting files
npx tsc --noEmit

# From root
npm run build  # Will fail on type errors
```

## Common Pitfalls

❌ **Don't:**
- Add implementation code
- Import client or server modules
- Use functions with side effects
- Export mutable objects

✅ **Do:**
- Keep types close to the domain
- Document complex types
- Use discriminated unions for variants
- Prefer interfaces over types for objects

## Next Steps

- See `../client/CLAUDE.md` for frontend development
- See `../server/CLAUDE.md` for backend development
- Check `../CLAUDE.md` for project overview
```

---

## Summary

These four CLAUDE.md files provide:

1. **Root**: Navigation and project overview
2. **Client**: Frontend-specific patterns and rules
3. **Server**: Backend-specific patterns and rules
4. **Shared**: Type definition standards

Each file is self-contained yet links to others, allowing Claude Code to quickly understand the context and constraints of the module it's working in.
