# Codebase Refactoring Plan - Overview

## ⚠️ IMPORTANT: Local Whisper Functionality is FULLY PRESERVED

**This refactoring does NOT remove or change local Whisper models:**
- ✅ All local Whisper code (`src/services/whisper.ts`) is **KEPT**
- ✅ Apple Silicon GPU (MPS) support is **KEPT**
- ✅ All local models (tiny, base, small, medium) remain available in UI
- ✅ Local transcription workflow unchanged
- 📁 File just moves to: `server/src/services/whisper.ts` (cleaner organization)

**What's being deleted:** Only legacy UI components, test endpoints, and unused features. Zero impact on local Whisper functionality.

---

## Current Architecture Status

### ✅ What's Working Well
1. **Next.js App Router Structure**: Modern setup with good separation of API routes
2. **Strategy Pattern**: Well-implemented for processing modes (On-Demand, Groq Batch)
3. **Database Layer**: Clean SQLite implementation with better-sqlite3
4. **Services Layer**: Good abstraction of business logic
5. **Type Definitions**: Centralized in `src/types/index.ts`
6. **Local Whisper Integration**: Python-based local transcription with GPU acceleration

### ⚠️ Major Issues Identified

#### 1. **Legacy "Single File" Mode Still Embedded**
- `AudioTranscription` component (1000+ lines) is imported but NEVER USED in the UI
- `batch-transcription.tsx` has a `activeMode` state that's hardcoded to "queue"
- The single-file UI was replaced by batch/queue mode but code remains
- Line 36 of batch-transcription.tsx: `useState<"single" | "queue">("queue")` - always "queue"

#### 2. **Frontend/Backend Code Mixed Together**
- Services like `whisper.ts`, `groq-batch-service.ts` run on BOTH client and server
- API client code mixed with server-side implementation
- No clear boundary between what runs in browser vs Node.js
- `audio-utils.ts` has FFmpeg calls (server-only) mixed with File API (client-only)

#### 3. **Unused/Test/Debug Code in Production**
- `/api/test-email/route.ts` - debug endpoint
- `/api/test-blob-cleanup/route.ts` - debug endpoint
- `/api/debug-batch-items/route.ts` - debug endpoint
- `/api/youtube/proxy/route.ts` - incomplete implementation, unused
- `/app/quality-test/page.tsx` - test page still in app
- `src/services/openai.ts` - only used by summarize API (feature not exposed in UI)
- `src/utils/audio-worker.ts` - Web Worker for MP3 encoding, never referenced

#### 4. **Duplicate Type Definitions**
- `src/types/index.ts` has main types
- `src/utils/shared-types.ts` has overlapping types
- Both define similar interfaces for audio/transcription state

#### 5. **Utility File Organization**
- `src/utils/index.ts` has random utility functions
- Time utilities duplicated between `time-utils.ts` and `index.ts`
- Unclear which utils are client vs server

#### 6. **Summarization Feature Incomplete**
- `TranscriptionSummarization` component exists
- `/api/summarize` endpoint exists with OpenAI integration
- Component imported in `audio-transcription.tsx` (unused legacy component)
- Feature not exposed in current UI at all
- `src/services/prompts/` directory with summarization prompts unused

## Goals of Refactoring

### 🎯 Primary Objectives
1. **Remove all legacy/unused code** - Clean slate for maintenance
2. **Separate frontend and backend** - Enable independent development
3. **Clear module boundaries** - Client vs Server vs Shared
4. **Improved developer experience** - Separate CLAUDE.md files for different contexts

### 📁 Proposed New Structure

```
v0transcription/
├── CLAUDE.md                    # Root overview, links to sub-agents
├── README.md                    # User-facing documentation
├── package.json                 # Monorepo or workspace setup
├──
├── client/                      # Frontend code
│   ├── CLAUDE.md               # Frontend-specific guidance
│   ├── src/
│   │   ├── app/                # Next.js App Router (pages only)
│   │   ├── components/         # React components
│   │   ├── hooks/              # Custom React hooks
│   │   ├── stores/             # Zustand stores
│   │   └── lib/                # Client-side utilities
│   └── public/                 # Static assets
│
├── server/                      # Backend code
│   ├── CLAUDE.md               # Backend-specific guidance
│   ├── src/
│   │   ├── api/                # API route handlers
│   │   ├── services/           # Business logic services
│   │   ├── database/           # Database layer
│   │   ├── strategies/         # Processing strategies
│   │   └── lib/                # Server-side utilities
│   └── data/                   # SQLite database
│
└── shared/                      # Shared code
    ├── CLAUDE.md               # Shared types guidance
    └── types/                  # TypeScript type definitions
```

### 🗑️ Files to Delete

**Components:**
- `src/components/audio-transcription.tsx` (1000+ lines, unused)
- `src/components/audio-splitter.tsx` (if only used by audio-transcription)
- `src/components/transcription-summarization.tsx` (feature not exposed)
- `src/components/quality-test-ui.tsx`
- `src/app/quality-test/page.tsx`

**API Routes:**
- `src/app/api/test-email/route.ts`
- `src/app/api/test-blob-cleanup/route.ts`
- `src/app/api/debug-batch-items/route.ts`
- `src/app/api/youtube/proxy/route.ts`
- `src/app/api/summarize/route.ts` (unless we want to keep this feature)

**Services & Utils:**
- `src/services/openai.ts` (only used by summarize)
- `src/services/prompts/` (only used by summarize)
- `src/utils/audio-worker.ts` (never used)
- `src/utils/quality-test.ts`
- `src/utils/shared-types.ts` (merge into main types)

**Legacy State:**
- Remove `activeMode` from batch-transcription (always "queue")
- Remove single-file processing logic from batch component

## Next Steps

See detailed plans in:
- `01-DELETION-PLAN.md` - Exact files to delete with dependency analysis
- `02-SEPARATION-PLAN.md` - Frontend/Backend separation strategy
- `03-CLAUDE-MD-PLAN.md` - New CLAUDE.md files for each context
- `04-MIGRATION-STEPS.md` - Step-by-step execution plan

## Risk Assessment

**Low Risk:**
- Deleting debug/test endpoints
- Removing unused components (audio-transcription)
- Removing activeMode toggle

**Medium Risk:**
- Summarization feature removal (could be kept for future)
- audio-worker.ts removal (verify no dynamic imports)

**High Risk:**
- Frontend/Backend separation (major refactor)
- Requires careful import path updates
- Needs testing at each step

## Success Criteria

✅ No unused code in production
✅ Clear separation: client/ server/ shared/
✅ Separate CLAUDE.md files for context-specific guidance
✅ All tests pass (npm run build, test:batch)
✅ Existing functionality unchanged
✅ Developer onboarding time reduced
