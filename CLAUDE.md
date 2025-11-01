# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js audio transcription application with batch processing, YouTube integration, and multiple AI model support. The codebase is organized into three main modules:

- **[client/](client/)** - Frontend React/Next.js code (see [client/CLAUDE.md](client/CLAUDE.md))
- **[server/](server/)** - Backend API and services (see [server/CLAUDE.md](server/CLAUDE.md))
- **[shared/](shared/)** - Shared TypeScript types (see [shared/CLAUDE.md](shared/CLAUDE.md))

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
**Read:** [client/CLAUDE.md](client/CLAUDE.md) for detailed frontend guidance
**Location:** `client/src/`

### Backend Work (API, Database, Services)
**Read:** [server/CLAUDE.md](server/CLAUDE.md) for detailed backend guidance
**Location:** `server/src/`

### Type Definitions
**Read:** [shared/CLAUDE.md](shared/CLAUDE.md) for type definition patterns
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

See: [server/src/strategies/](server/src/strategies/)

### State Management (Frontend)
Zustand store manages batch queue state:
- Queue items with drag & drop ordering
- Real-time progress tracking
- Resumable processing for split files

See: [client/src/stores/batchQueueStore.ts](client/src/stores/batchQueueStore.ts)

### Database (Backend)
SQLite with WAL mode for concurrent access:
- `batch_jobs` - Job metadata and status
- `batch_items` - Individual items in each job

See: [server/src/database/](server/src/database/)

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
→ Work in `client/src/components/`, read [client/CLAUDE.md](client/CLAUDE.md)

**Add a new API endpoint:**
→ Work in `server/src/api/`, read [server/CLAUDE.md](server/CLAUDE.md)

**Add a new type:**
→ Work in `shared/types/`, read [shared/CLAUDE.md](shared/CLAUDE.md)

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