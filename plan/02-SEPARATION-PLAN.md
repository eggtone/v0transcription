# Frontend/Backend Separation Plan

## Goal

Clearly separate client-side and server-side code into distinct directories with separate CLAUDE.md files for context-specific AI assistance.

---

## Proposed Directory Structure

```
v0transcription/
├── CLAUDE.md                           # Root: project overview, links to sub-contexts
├── README.md                           # User documentation
├── CONTRIBUTING.md
├── package.json                        # Root workspace configuration
├── tsconfig.json                       # Root TypeScript config
├── next.config.js                      # Next.js config (references both client/server)
├──
├── client/                             # ALL CLIENT-SIDE CODE
│   ├── CLAUDE.md                       # Frontend-specific guidance
│   ├── tsconfig.json                   # Extends root, client-specific settings
│   ├── src/
│   │   ├── app/                        # Next.js App Router (pages & layouts ONLY)
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   └── globals.css
│   │   ├── components/                 # React components
│   │   │   ├── ui/                     # shadcn/ui components
│   │   │   ├── batch-processor.tsx
│   │   │   ├── batch-transcription.tsx
│   │   │   ├── batch-job-manager.tsx
│   │   │   ├── audio-queue-manager.tsx
│   │   │   ├── youtube-input.tsx
│   │   │   ├── transcription-display.tsx
│   │   │   ├── transcription-editor.tsx
│   │   │   ├── audio-player.tsx
│   │   │   ├── batch-item-audio-player.tsx
│   │   │   ├── floating-player.tsx
│   │   │   ├── processing-mode-selector.tsx
│   │   │   └── audio-quality-selector.tsx
│   │   ├── stores/                     # Zustand stores
│   │   │   └── batchQueueStore.ts
│   │   ├── hooks/                      # Custom React hooks (NEW)
│   │   │   ├── useTranscription.ts     # Extract transcription logic
│   │   │   ├── useBatchProcessing.ts   # Extract batch logic
│   │   │   └── useAudioUpload.ts       # Extract upload logic
│   │   ├── lib/                        # Client-side utilities
│   │   │   ├── api-client.ts           # Frontend API calls ONLY
│   │   │   ├── audio-utils.ts          # Browser File API only
│   │   │   ├── download-utils.ts
│   │   │   └── time-utils.ts           # UI formatting
│   │   └── styles/                     # CSS files
│   └── public/                         # Static assets
│
├── server/                             # ALL SERVER-SIDE CODE
│   ├── CLAUDE.md                       # Backend-specific guidance
│   ├── tsconfig.json                   # Extends root, server-specific settings
│   ├── src/
│   │   ├── api/                        # API route handlers (moved from app/api)
│   │   │   ├── transcribe/
│   │   │   │   ├── route.ts
│   │   │   │   └── youtube/
│   │   │   │       └── route.ts
│   │   │   ├── batch/
│   │   │   │   ├── submit/route.ts
│   │   │   │   ├── list/route.ts
│   │   │   │   ├── poller/route.ts
│   │   │   │   ├── cleanup-blobs/route.ts
│   │   │   │   └── [jobId]/
│   │   │   │       ├── status/route.ts
│   │   │   │       ├── items/route.ts
│   │   │   │       ├── results/route.ts
│   │   │   │       ├── retry/route.ts
│   │   │   │       ├── cancel/route.ts
│   │   │   │       ├── delete/route.ts
│   │   │   │       ├── failed-items/route.ts
│   │   │   │       └── audio-urls/route.ts
│   │   │   ├── youtube/
│   │   │   │   ├── extract/route.ts
│   │   │   │   ├── playlist/route.ts
│   │   │   │   ├── info/route.ts
│   │   │   │   └── audio/route.ts
│   │   │   ├── audio/
│   │   │   │   └── split/route.ts
│   │   │   ├── upload-for-batch/route.ts
│   │   │   ├── cleanup-temp/route.ts
│   │   │   └── send-notification/route.ts
│   │   ├── services/                   # Business logic services
│   │   │   ├── whisper.ts              # Local Whisper execution
│   │   │   ├── groq-batch-service.ts   # Groq batch API
│   │   │   ├── transcription-service.ts
│   │   │   ├── youtube.ts              # yt-dlp wrapper
│   │   │   ├── email-service.ts
│   │   │   ├── notification-service.ts
│   │   │   ├── blob-cleanup-service.ts
│   │   │   └── batch-poller.ts
│   │   ├── strategies/                 # Processing strategy pattern
│   │   │   ├── processing-strategy.ts
│   │   │   ├── on-demand-processor.ts
│   │   │   └── groq-batch-processor.ts
│   │   ├── database/                   # Database layer
│   │   │   ├── index.ts                # Re-export (was lib/database.ts)
│   │   │   ├── schema.ts               # Table definitions
│   │   │   └── queries.ts              # Prepared statements
│   │   └── lib/                        # Server utilities
│   │       ├── audio-utils.ts          # FFmpeg operations ONLY
│   │       ├── audio-split-utils.ts    # Server-side splitting
│   │       ├── audio-source-utils.ts
│   │       ├── transcription-utils.ts
│   │       ├── time-utils.ts           # Server-side time handling
│   │       └── logger.ts
│   └── data/                           # SQLite database storage
│       └── transcriptor.db
│
└── shared/                             # SHARED TYPES ONLY
    ├── CLAUDE.md                       # Type definition guidance
    ├── tsconfig.json                   # Strict type-only config
    └── types/
        ├── index.ts                    # Main type exports
        ├── transcription.ts            # Transcription types
        ├── batch.ts                    # Batch processing types
        ├── youtube.ts                  # YouTube types
        └── api.ts                      # API request/response types
```

---

## Module Boundaries

### Client Module (`client/`)

**Can Import:**
- ✅ `shared/types/*`
- ✅ Other files within `client/`

**Cannot Import:**
- ❌ `server/*` (enforced by TypeScript paths)

**Allowed APIs:**
- Browser APIs: `File`, `Blob`, `FormData`, `fetch`
- React APIs
- Zustand
- UI libraries (shadcn/ui)

**Responsibilities:**
- UI components and rendering
- User interactions
- Client-side state management
- API calls to server
- Browser file handling
- Audio playback (not processing)

---

### Server Module (`server/`)

**Can Import:**
- ✅ `shared/types/*`
- ✅ Other files within `server/`

**Cannot Import:**
- ❌ `client/*` (enforced by TypeScript paths)

**Allowed APIs:**
- Node.js APIs: `fs`, `path`, `os`, `child_process`
- Next.js server APIs
- External services (Groq, YouTube, etc.)
- Database operations

**Responsibilities:**
- API route handlers
- Audio processing (FFmpeg)
- Transcription execution
- Database operations
- File system operations
- External service integration

---

### Shared Module (`shared/`)

**Can Import:**
- ✅ Nothing (types only, no implementations)

**Contains Only:**
- TypeScript type definitions
- Interfaces
- Enums
- Type guards (pure functions, no side effects)

**Used By:**
- Both `client/` and `server/`

---

## File Migration Map

### Current → New Location

#### Components (Stay in Client)
```
src/components/* → client/src/components/*
```

#### API Routes (Move to Server)
```
src/app/api/* → server/src/api/*
```

#### Services (Move to Server)
```
src/services/* → server/src/services/*
```

#### Strategies (Move to Server)
```
src/strategies/* → server/src/strategies/*
```

#### Database (Move to Server)
```
src/lib/database.ts → server/src/database/index.ts
```

#### Stores (Stay in Client)
```
src/store/* → client/src/stores/*
```

#### Types (Move to Shared)
```
src/types/index.ts → shared/types/*
(split into multiple files)
```

#### Utilities (SPLIT by usage)

**Client Utils:**
```
src/utils/download-utils.ts → client/src/lib/download-utils.ts
src/utils/time-utils.ts → client/src/lib/time-utils.ts (UI formatting only)
```

**Server Utils:**
```
src/utils/audio-utils.ts → server/src/lib/audio-utils.ts (FFmpeg parts)
src/utils/audio-split-utils.ts → server/src/lib/audio-split-utils.ts
src/utils/audio-source-utils.ts → server/src/lib/audio-source-utils.ts
src/utils/transcription-utils.ts → server/src/lib/transcription-utils.ts
src/utils/logger.ts → server/src/lib/logger.ts
```

**Shared Utils (if truly shared):**
```
src/utils/time-utils.ts → Split into:
  - client/src/lib/time-utils.ts (formatTime for UI)
  - server/src/lib/time-utils.ts (time calculations)
```

---

## TypeScript Configuration

### Root `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### `client/tsconfig.json`
```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "paths": {
      "@/*": ["./src/*"],
      "@shared/*": ["../shared/*"]
    },
    "plugins": [{ "name": "next" }]
  },
  "include": ["src/**/*", "../shared/**/*"],
  "exclude": ["node_modules", "../server"]
}
```

### `server/tsconfig.json`
```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "module": "commonjs",
    "target": "ES2022",
    "paths": {
      "@server/*": ["./src/*"],
      "@shared/*": ["../shared/*"]
    }
  },
  "include": ["src/**/*", "../shared/**/*"],
  "exclude": ["node_modules", "../client"]
}
```

### `shared/tsconfig.json`
```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "declaration": true,
    "emitDeclarationOnly": true,
    "outDir": "./dist"
  },
  "include": ["types/**/*"]
}
```

---

## Import Path Updates

### Before
```typescript
import { DetailedTranscription } from '@/types';
import { transcribeAudio } from '@/services/api-client';
import { formatTime } from '@/utils/time-utils';
```

### After (in client/)
```typescript
import { DetailedTranscription } from '@shared/types';
import { transcribeAudio } from '@/lib/api-client';
import { formatTime } from '@/lib/time-utils';
```

### After (in server/)
```typescript
import { DetailedTranscription } from '@shared/types';
import { executeWhisper } from '@server/services/whisper';
import { formatTime } from '@server/lib/time-utils';
```

---

## Next.js Integration

### `next.config.js`
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Point Next.js to client source
  experimental: {
    appDir: true,
  },
  // API routes in server/src/api need to be registered
  rewrites: async () => {
    return [
      {
        source: '/api/:path*',
        destination: '/server/src/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
```

**Note:** Next.js 15 with App Router expects API routes in `app/api/`. We'll need to either:
1. Keep API routes in `client/src/app/api/` but they import from `server/`
2. Use Next.js middleware to route to server code
3. Keep Next.js convention but enforce import rules

**Recommended:** Keep `client/src/app/api/` as thin route handlers that import from `server/`

```typescript
// client/src/app/api/transcribe/route.ts
import { handleTranscribe } from '@server/api/transcribe';

export const POST = handleTranscribe;
```

```typescript
// server/src/api/transcribe.ts
export async function handleTranscribe(req: NextRequest) {
  // All logic here
}
```

---

## Package.json Structure

### Option A: Monorepo with Workspaces
```json
{
  "name": "v0transcription",
  "private": true,
  "workspaces": ["client", "server", "shared"],
  "scripts": {
    "dev": "npm run dev --workspace=client",
    "build": "npm run build --workspace=client",
    "build:server": "npm run build --workspace=server",
    "lint": "npm run lint --workspaces"
  }
}
```

### Option B: Single Package with Separate Dirs
Keep current single package.json, use TypeScript paths to enforce separation.

**Recommended:** Option B (simpler, less overhead)

---

## Benefits of This Separation

### For AI Agents (Claude Code)
1. **Context-Specific CLAUDE.md**: Frontend agent gets UI/React patterns, Backend agent gets Node.js/DB patterns
2. **Reduced Context**: Agent only loads relevant code for the task
3. **Clear Boundaries**: Agent knows what it can/cannot import

### For Developers
1. **Clear Mental Model**: Know immediately if code is client or server
2. **No Accidental Imports**: TypeScript prevents importing Node.js in browser code
3. **Easier Testing**: Test client and server independently
4. **Better Code Review**: Changes clearly indicate frontend vs backend

### For Maintenance
1. **Independent Scaling**: Can split into separate repos later if needed
2. **Deployment Flexibility**: Could deploy API separately from frontend
3. **Type Safety**: Shared types ensure API contract consistency

---

## Migration Strategy

See `04-MIGRATION-STEPS.md` for detailed step-by-step execution plan.

**High-Level Phases:**
1. Create directory structure
2. Move shared types first
3. Move server code
4. Move client code
5. Update imports
6. Verify builds
7. Update documentation
