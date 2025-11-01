# Migration Steps - Detailed Execution Plan

## ✅ EXECUTION STATUS

**Last Updated:** 2025-11-01

### Completed Phases:
- ✅ **Phase 0:** Feature branch created (`refactor/separate-client-server`), database backed up
- ✅ **Phase 1:** Legacy code deletion complete (~2,700 lines removed)
  - Deleted: test endpoints, quality test, legacy AudioTranscription, summarization feature, audio-worker
  - 6 commits made, all builds passing
- ✅ **Phase 2:** Type consolidation complete
  - Merged shared-types.ts into types/index.ts

### Currently Working On:
- 🔄 **Phase 3-4:** Creating directory structure and moving shared types

### Git Status:
- Branch: `refactor/separate-client-server`
- Commits: 6
- All builds passing (only ESLint warnings)
- **Local Whisper fully preserved** - `src/services/whisper.ts` untouched

---

## Overview

This document provides step-by-step instructions for executing the refactoring plan. Each phase can be committed separately for easy rollback.

---

## Phase 0: Preparation (No Code Changes) ✅ COMPLETE

### Step 0.1: Create Feature Branch
```bash
git checkout -b refactor/separate-client-server
```

### Step 0.2: Backup Database
```bash
cp data/transcriptor.db data/transcriptor.db.backup
```

### Step 0.3: Run Initial Tests
```bash
npm run build
npm run lint
npm run test:batch
```

Document any existing warnings/errors.

### Step 0.4: Create Dependency Graph
```bash
# Install dependency visualization (optional)
npm install -g madge

# Generate dependency graph
madge --image deps-before.svg src/
```

---

## Phase 1: Delete Legacy Code ✅ COMPLETE

**Goal:** Remove unused components, test endpoints, and obsolete features

**STATUS:** Complete - 2,700+ lines removed across 6 commits

### Step 1.1: Delete Test & Debug Endpoints

```bash
# Delete files
rm src/app/api/test-email/route.ts
rm src/app/api/test-blob-cleanup/route.ts
rm src/app/api/debug-batch-items/route.ts
rm src/app/api/youtube/proxy/route.ts

# Verify no references (should return no results)
grep -r "test-email\|test-blob\|debug-batch\|youtube/proxy" src/
```

**Commit:**
```bash
git add -A
git commit -m "refactor: remove debug and test API endpoints

- Remove /api/test-email
- Remove /api/test-blob-cleanup
- Remove /api/debug-batch-items
- Remove /api/youtube/proxy (incomplete implementation)

These were development-only endpoints not used in production."
```

### Step 1.2: Delete Quality Test Feature

```bash
# Delete files
rm -rf src/app/quality-test/
rm src/components/quality-test-ui.tsx
rm src/utils/quality-test.ts

# Verify no references
grep -r "quality-test\|QualityTest" src/
```

**Commit:**
```bash
git add -A
git commit -m "refactor: remove quality test feature

- Remove /quality-test page
- Remove QualityTestUI component
- Remove quality-test utilities

This was a development tool not used in production."
```

### Step 1.3: Analyze Audio Worker Usage

```bash
# Check for any references
grep -r "audio-worker" src/
grep -r "new Worker" src/
grep -r "lamejs" src/

# If no references found, delete
rm src/utils/audio-worker.ts

# Check if lamejs can be removed from package.json
# (Only if audio-worker was the only user)
```

**Commit (if safe to delete):**
```bash
git add -A
git commit -m "refactor: remove unused audio-worker

Web Worker for MP3 encoding was never used in the application.
Audio processing is handled server-side with FFmpeg."
```

### Step 1.4: Analyze Audio Transcription Component

```bash
# Find all imports
grep -r "audio-transcription" src/

# Check which components are ONLY used by audio-transcription
grep -r "AudioSplitter" src/
grep -r "FloatingPlayer" src/
grep -r "TranscriptionDisplay" src/
grep -r "TranscriptionEditor" src/
grep -r "TranscriptionSummarization" src/
```

**Decision Tree:**
- If component is ONLY used by audio-transcription.tsx → Delete with it
- If component is used by batch-transcription.tsx → Keep

**Likely deletions:**
```bash
rm src/components/audio-transcription.tsx
rm src/components/transcription-summarization.tsx
# Possibly: audio-splitter.tsx (check usage first)
```

**Update batch-transcription.tsx:**
```typescript
// Remove this import (line 9)
// import AudioTranscription from "@/components/audio-transcription";

// Remove activeMode state (always "queue")
// Line 36: const [activeMode, setActiveMode] = useState<"single" | "queue">("queue");
// This state is never used for rendering
```

**Commit:**
```bash
git add -A
git commit -m "refactor: remove legacy single-file transcription mode

- Remove AudioTranscription component (1000+ lines, unused)
- Remove TranscriptionSummarization component
- Remove activeMode state from BatchTranscription (was hardcoded to 'queue')

The app now exclusively uses the batch/queue mode interface."
```

### Step 1.5: Delete Summarization Feature

```bash
# Delete files
rm src/app/api/summarize/route.ts
rm src/services/openai.ts
rm -rf src/services/prompts/

# Verify no other references
grep -r "summarize\|openai" src/
```

**Note:** Keep `openai` package in package.json (used by Groq service)

**Commit:**
```bash
git add -A
git commit -m "refactor: remove OpenAI summarization feature

- Remove /api/summarize endpoint
- Remove OpenAI service wrapper
- Remove summarization prompts

Feature was fully implemented but not exposed in UI.
Can be restored from git history if needed in future.

Note: 'openai' package kept as dependency (used by Groq service)."
```

### Step 1.6: Run Tests After Deletions

```bash
npm run build
npm run lint
npm run test:batch
```

If errors occur, review and fix before proceeding.

**Commit (if fixes needed):**
```bash
git add -A
git commit -m "fix: resolve issues after legacy code removal"
```

---

## Phase 2: Consolidate Types ✅ COMPLETE

**Goal:** Merge duplicate type definitions into single source of truth

**STATUS:** Complete - shared-types.ts merged into types/index.ts

### Step 2.1: Analyze Type Duplication

```bash
# Check where shared-types is used
grep -r "shared-types" src/

# Check what's in each file
cat src/types/index.ts | grep "export"
cat src/utils/shared-types.ts | grep "export"
```

### Step 2.2: Merge Types

**Edit `src/types/index.ts`:**

```typescript
// Add types from shared-types.ts
export interface ProgressTracker {
  setProgress: (percent: number) => void;
  setElapsedTime?: (seconds: number) => void;
  progress?: number;
  elapsedTime?: number;
}

export interface AudioSourceState {
  audioFile?: File | null;
  audioUrl?: string | null;
  audioFileName?: string | null;
  isExtracting?: boolean;
  youtubeVideoInfo?: YouTubeVideoInfo | null;
  youtubeError?: string | null;

  setAudioFile?: (file: File | null) => void;
  setAudioUrl?: (url: string | null) => void;
  setAudioFileName?: (name: string | null) => void;
  setIsExtracting?: (isExtracting: boolean) => void;
  setYoutubeVideoInfo?: (info: YouTubeVideoInfo | null) => void;
  setYoutubeError?: (error: string | null) => void;
}

export interface TranscriptionState extends AudioSourceState {
  isTranscribing?: boolean;
  transcriptionProgress?: number;
  elapsedTime?: number;
  selectedModel?: string;
  languageModelOptions?: string[];
  currentPart?: number;
  totalParts?: number;
  transcriptionError?: string | null;

  setIsTranscribing?: (isTranscribing: boolean) => void;
  setTranscriptionProgress?: (progress: number) => void;
  setElapsedTime?: (time: number) => void;
  setSelectedModel?: (model: string) => void;
  setLanguageModelOptions?: (options: string[]) => void;
  setCurrentPart?: (part: number) => void;
  setTotalParts?: (total: number) => void;
  setTranscriptionError?: (error: string | null) => void;
}
```

### Step 2.3: Update Imports

```bash
# Find all imports of shared-types
grep -rn "from '@/utils/shared-types'" src/

# Replace with @/types
# This can be done with sed or manually
find src -type f -name "*.ts" -o -name "*.tsx" | xargs sed -i '' "s/@\/utils\/shared-types/@\/types/g"
```

### Step 2.4: Delete Old File

```bash
rm src/utils/shared-types.ts

# Verify build still works
npm run build
```

**Commit:**
```bash
git add -A
git commit -m "refactor: consolidate type definitions

- Merge shared-types.ts into types/index.ts
- Update all imports to use @/types
- Remove duplicate type definitions

All types now centralized in src/types/ directory."
```

---

## Phase 3: Create New Directory Structure 🔄 IN PROGRESS

**Goal:** Set up client/, server/, shared/ directories

### Step 3.1: Create Directories

```bash
mkdir -p client/src/{app,components,stores,lib}
mkdir -p server/src/{api,services,strategies,database,lib}
mkdir -p shared/types
mkdir -p server/data
```

### Step 3.2: Create Initial Config Files

**`client/tsconfig.json`:**
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
  "include": [
    "src/**/*",
    "../shared/**/*"
  ],
  "exclude": [
    "node_modules",
    "../server"
  ]
}
```

**`server/tsconfig.json`:**
```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "target": "ES2022",
    "module": "commonjs",
    "paths": {
      "@server/*": ["./src/*"],
      "@shared/*": ["../shared/*"]
    }
  },
  "include": [
    "src/**/*",
    "../shared/**/*"
  ],
  "exclude": [
    "node_modules",
    "../client"
  ]
}
```

**`shared/tsconfig.json`:**
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

**Commit:**
```bash
git add -A
git commit -m "feat: create client/server/shared directory structure

- Add client/, server/, shared/ directories
- Add TypeScript configurations for each module
- Set up path aliases: @/, @server/, @shared/

Preparing for module separation."
```

---

## Phase 4: Move Shared Types

**Goal:** Move types to shared module first (foundation for everything else)

### Step 4.1: Copy Types

```bash
cp src/types/index.ts shared/types/index.ts
```

### Step 4.2: Split Types (Optional but Recommended)

Create separate files for better organization:

**`shared/types/transcription.ts`:**
```typescript
export interface TranscriptionSegment { /* ... */ }
export interface DetailedTranscription { /* ... */ }
export interface WhisperTranscriptionResult { /* ... */ }
```

**`shared/types/batch.ts`:**
```typescript
export interface QueuedAudioItem { /* ... */ }
export interface EnhancedQueuedAudioItem { /* ... */ }
```

**`shared/types/youtube.ts`:**
```typescript
export interface YouTubeVideoInfo { /* ... */ }
```

**`shared/types/audio.ts`:**
```typescript
export interface AudioPart { /* ... */ }
export type MP3Quality = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
```

**`shared/types/index.ts`:**
```typescript
export * from './transcription';
export * from './batch';
export * from './youtube';
export * from './audio';
```

### Step 4.3: Update Root tsconfig.json

```json
{
  "compilerOptions": {
    // ... existing options
    "paths": {
      "@/*": ["./src/*"],
      "@shared/*": ["./shared/*"]
    }
  }
}
```

### Step 4.4: Test Type Imports

Create a test file to verify:

```typescript
// test-imports.ts
import { DetailedTranscription } from '@shared/types';

const test: DetailedTranscription = {
  text: "test",
  segments: [],
  language: "en"
};
```

```bash
npx tsc --noEmit test-imports.ts
rm test-imports.ts
```

**Commit:**
```bash
git add -A
git commit -m "feat: move types to shared module

- Create shared/types/ with organized type files
- Split types into: transcription, batch, youtube, audio
- Update TypeScript paths to support @shared/* imports

Types are now the shared foundation for client and server."
```

---

## Phase 5: Move Server Code

**Goal:** Move all server-side code to server/ module

### Step 5.1: Move Services

```bash
cp -r src/services/* server/src/services/
```

Update imports in each service file:
```typescript
// Before
import { DetailedTranscription } from '@/types';

// After
import { DetailedTranscription } from '@shared/types';
```

### Step 5.2: Move Strategies

```bash
cp -r src/strategies/* server/src/strategies/
```

Update imports similarly.

### Step 5.3: Move Database

```bash
cp src/lib/database.ts server/src/database/index.ts

# Move data directory
mv data server/data
```

**Update database.ts:**
```typescript
// Update path to database file
const DB_PATH = path.join(__dirname, '../../data/transcriptor.db');
```

### Step 5.4: Move Server Utilities

```bash
# These are server-only utilities
cp src/utils/audio-utils.ts server/src/lib/audio-utils.ts
cp src/utils/audio-split-utils.ts server/src/lib/audio-split-utils.ts
cp src/utils/audio-source-utils.ts server/src/lib/audio-source-utils.ts
cp src/utils/transcription-utils.ts server/src/lib/transcription-utils.ts
cp src/utils/logger.ts server/src/lib/logger.ts
```

Update all imports to use `@server/` and `@shared/`.

### Step 5.5: Move API Routes

```bash
cp -r src/app/api/* server/src/api/
```

Update imports in each route file:
```typescript
// Before
import { transcribeAudio } from '@/services/api-client';
import { DetailedTranscription } from '@/types';

// After
import { transcribeAudio } from '@server/services/api-client';
import { DetailedTranscription } from '@shared/types';
```

### Step 5.6: Create Server Entry Points

**`server/src/index.ts`:**
```typescript
export * from './services';
export * from './strategies';
export * from './database';
```

### Step 5.7: Test Server Builds

```bash
cd server
npx tsc --noEmit
cd ..
```

Fix any import errors.

**Commit:**
```bash
git add -A
git commit -m "feat: move server code to server module

- Move services/ to server/src/services/
- Move strategies/ to server/src/strategies/
- Move database to server/src/database/
- Move API routes to server/src/api/
- Move server utilities to server/src/lib/
- Update all imports to use @server/ and @shared/

Server code now fully separated from client."
```

---

## Phase 6: Move Client Code

**Goal:** Move all client-side code to client/ module

### Step 6.1: Move App Router Files

```bash
cp -r src/app/* client/src/app/

# Keep only pages and layouts, NOT API routes
rm -rf client/src/app/api
```

### Step 6.2: Move Components

```bash
cp -r src/components client/src/components
```

### Step 6.3: Move Stores

```bash
cp -r src/store client/src/stores
```

### Step 6.4: Move Client Utilities

```bash
# These are client-only utilities
cp src/utils/download-utils.ts client/src/lib/download-utils.ts
cp src/utils/time-utils.ts client/src/lib/time-utils.ts
```

Note: `time-utils.ts` might need to be split if it has server-side code.

### Step 6.5: Extract Client API Functions

**`client/src/lib/api-client.ts`:**

Keep only the client-facing API call functions:
```typescript
import { DetailedTranscription } from '@shared/types';

export async function transcribeAudio(
  source: File,
  model: string,
  language: string = 'en'
): Promise<DetailedTranscription> {
  const formData = new FormData();
  formData.append("file", source);
  formData.append("model", model);
  formData.append("language", language);

  const response = await fetch("/api/transcribe", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to transcribe audio");
  }

  const data = await response.json();
  return data.transcription;
}
```

Remove any server-side implementation (Groq client, etc.)

### Step 6.6: Update Component Imports

Update all components:
```typescript
// Before
import { DetailedTranscription } from '@/types';
import { formatTime } from '@/utils/time-utils';
import { useBatchQueueStore } from '@/store/batchQueueStore';

// After
import { DetailedTranscription } from '@shared/types';
import { formatTime } from '@/lib/time-utils';
import { useBatchQueueStore } from '@/stores/batchQueueStore';
```

### Step 6.7: Test Client Builds

```bash
cd client
npx tsc --noEmit
cd ..
```

**Commit:**
```bash
git add -A
git commit -m "feat: move client code to client module

- Move app/ pages and layouts to client/src/app/
- Move components/ to client/src/components/
- Move store/ to client/src/stores/
- Move client utilities to client/src/lib/
- Update all imports to use @/ and @shared/

Client code now fully separated from server."
```

---

## Phase 7: Update Next.js Configuration

**Goal:** Make Next.js aware of new structure

### Step 7.1: Update next.config.js

```javascript
/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  // Point to client source
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'client/src'),
      '@shared': path.resolve(__dirname, 'shared'),
      '@server': path.resolve(__dirname, 'server/src'),
    };
    return config;
  },
};

module.exports = nextConfig;
```

### Step 7.2: Update package.json Scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test:batch": "node scripts/test-batch-simple.mjs",
    "test:batch:verbose": "node scripts/test-batch-system.js --mock",
    "type-check": "tsc --noEmit && cd client && tsc --noEmit && cd ../server && tsc --noEmit"
  }
}
```

### Step 7.3: Update API Route Handlers

Since Next.js expects API routes in `app/api/`, create thin wrappers:

**`client/src/app/api/transcribe/route.ts`:**
```typescript
import { handleTranscribe } from '@server/api/transcribe';

export const POST = handleTranscribe;
```

Or keep full routes in client/src/app/api/ but import server functions.

**Commit:**
```bash
git add -A
git commit -m "feat: update Next.js configuration for new structure

- Update webpack aliases for @, @shared, @server
- Update package.json scripts
- Create API route wrappers in client/

Next.js now works with separated modules."
```

---

## Phase 8: Clean Up Old Files

**Goal:** Remove original src/ directory

### Step 8.1: Verify Everything Works

```bash
npm run build
npm run lint
npm run type-check
npm run test:batch
```

### Step 8.2: Remove Old src/

```bash
# Make sure everything is copied and working first!
rm -rf src
```

### Step 8.3: Final Test

```bash
npm run dev
```

Test all functionality:
- Local file upload
- YouTube URL
- Batch processing
- Job management

**Commit:**
```bash
git add -A
git commit -m "refactor: remove old src directory

All code successfully migrated to client/, server/, shared/ structure.
Legacy src/ directory removed.

Verified: build, lint, type-check, batch tests all passing."
```

---

## Phase 9: Add CLAUDE.md Files

**Goal:** Add context-specific documentation

### Step 9.1: Create CLAUDE.md Files

Use content from `03-CLAUDE-MD-PLAN.md`:

```bash
# Create files with content from plan
# (Copy the markdown content from plan)

# Root
vim CLAUDE.md

# Client
vim client/CLAUDE.md

# Server
vim server/CLAUDE.md

# Shared
vim shared/CLAUDE.md
```

### Step 9.2: Update Root Documentation

Update README.md to reflect new structure.

**Commit:**
```bash
git add -A
git commit -m "docs: add module-specific CLAUDE.md files

- Add root CLAUDE.md with project overview
- Add client/CLAUDE.md with frontend guidance
- Add server/CLAUDE.md with backend guidance
- Add shared/CLAUDE.md with type definition patterns

Each module now has context-specific AI agent guidance."
```

---

## Phase 10: Final Verification

### Step 10.1: Complete Test Suite

```bash
# Build
npm run build

# Lint
npm run lint

# Type check all modules
npm run type-check

# Batch tests
npm run test:batch

# Manual testing
npm run dev
# Test all features in browser
```

### Step 10.2: Verify Import Boundaries

```bash
# Should fail - client importing server
# Create test file to verify TypeScript catches this
echo "import { WhisperService } from '@server/services/whisper';" > client/src/test.ts
cd client && npx tsc --noEmit
# Should show error
rm src/test.ts
```

### Step 10.3: Create Dependency Graph (After)

```bash
madge --image deps-after.svg client/src
madge --image deps-after-server.svg server/src
```

Compare with deps-before.svg.

### Step 10.4: Update Documentation

- [ ] Update CONTRIBUTING.md
- [ ] Update README.md architecture section
- [ ] Add migration notes
- [ ] Update .gitignore if needed

**Final Commit:**
```bash
git add -A
git commit -m "docs: update documentation for refactored structure

- Update CONTRIBUTING.md with new directory structure
- Update README.md architecture section
- Add migration notes

Refactoring complete. All modules separated and documented."
```

---

## Rollback Strategy

If issues arise at any phase:

```bash
# Rollback to last good commit
git reset --hard HEAD~1

# Or rollback entire refactor
git reset --hard origin/main
git branch -D refactor/separate-client-server
```

---

## Validation Checklist

After completing all phases:

- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] `npm run type-check` passes for all modules
- [ ] `npm run test:batch` succeeds
- [ ] Dev server starts without errors
- [ ] Can upload and transcribe local file
- [ ] Can transcribe YouTube video
- [ ] Batch processing works
- [ ] Groq batch API integration works
- [ ] Database operations work
- [ ] Can download results
- [ ] No TypeScript errors
- [ ] Client cannot import from server (verified by TypeScript)
- [ ] Server cannot import from client (verified by TypeScript)
- [ ] All CLAUDE.md files in place

---

## Estimated Time

- Phase 1 (Deletion): 2-3 hours
- Phase 2 (Type consolidation): 1 hour
- Phase 3-4 (Setup + Shared): 1 hour
- Phase 5 (Server move): 3-4 hours
- Phase 6 (Client move): 3-4 hours
- Phase 7 (Next.js config): 2 hours
- Phase 8 (Cleanup): 1 hour
- Phase 9 (Documentation): 2 hours
- Phase 10 (Verification): 2 hours

**Total: 17-22 hours** (can be split across multiple days)

---

## Notes

- Each phase should be committed separately
- Test after each phase before proceeding
- Can pause and resume at any commit
- Keep backup branch until refactoring is production-tested
- Consider feature flag for gradual rollout if deployed
