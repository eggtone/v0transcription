# Deletion Plan - Legacy & Unused Code

## ⚠️ IMPORTANT: Local Whisper is NOT Being Deleted

**Local Whisper functionality is 100% PRESERVED:**
- `src/services/whisper.ts` → **MOVING** to `server/src/services/whisper.ts` (NOT deleting)
- All local models (tiny, base, small, medium) → **KEPT**
- Apple Silicon GPU support → **KEPT**
- Python Whisper execution → **KEPT**

**This plan ONLY deletes:**
- Unused UI components (legacy single-file mode)
- Test/debug endpoints
- Incomplete features

---

## Phase 1: Test & Debug Endpoints (Zero Risk)

### Files to Delete
```
src/app/api/test-email/route.ts
src/app/api/test-blob-cleanup/route.ts
src/app/api/debug-batch-items/route.ts
```

**Justification:**
- These are debug endpoints not used in production
- No dependencies in main codebase
- Pattern: `/test-*` and `/debug-*` are clearly dev-only

**Verification:** Grep for imports/references - should find none

---

## Phase 2: Quality Test Page (Zero Risk)

### Files to Delete
```
src/app/quality-test/page.tsx
src/components/quality-test-ui.tsx
src/utils/quality-test.ts
```

**Justification:**
- Test page for YouTube audio quality comparison
- Not linked from main UI
- Only used during development

**Dependencies:**
- `quality-test/page.tsx` imports `quality-test-ui.tsx`
- `quality-test-ui.tsx` imports `quality-test.ts`
- No other files reference these

**Verification:**
```bash
grep -r "quality-test" src/ --exclude-dir=quality-test
grep -r "QualityTest" src/
```

---

## Phase 3: YouTube Proxy (Incomplete Feature - Zero Risk)

### Files to Delete
```
src/app/api/youtube/proxy/route.ts
```

**Justification:**
- Incomplete implementation (see comments in file lines 45-57)
- Returns JSON instead of streaming audio
- Comments say "we'll need to create a separate API route"
- Never referenced in client code

**Verification:**
```bash
grep -r "youtube/proxy" src/
# Should only find the file itself
```

---

## Phase 4: Summarization Feature (Low Risk - Optional)

### Decision Required: Keep or Delete?

**Files Involved:**
```
src/app/api/summarize/route.ts
src/components/transcription-summarization.tsx
src/services/openai.ts
src/services/prompts/index.ts
src/services/prompts/summarization/
```

**Current Status:**
- ✅ Fully implemented API endpoint
- ✅ Complete UI component
- ❌ NOT exposed in current UI
- ❌ Only imported by unused `audio-transcription.tsx`

**Option A: DELETE (Recommended)**
- Reduces dependencies (removes OpenAI SDK dependency)
- Simplifies codebase
- Can be restored from git history if needed

**Option B: KEEP**
- Feature could be useful in future
- Already fully implemented
- Move to "future features" branch

**Recommendation:** DELETE for now, create feature branch first

**Dependencies if deleting:**
- Remove `openai` package from package.json dependencies
- Remove OpenAI env vars from documentation
- Check if `groq-batch-service.ts` uses OpenAI SDK (it does)
- **WAIT: groq-batch-service imports OpenAI SDK for Groq API**
- **Cannot remove OpenAI package, only the summarize feature**

**Revised: Delete only the summarization feature, keep OpenAI package**

---

## Phase 5: Audio Worker (Low Risk)

### Files to Delete
```
src/utils/audio-worker.ts
```

**Justification:**
- Web Worker for MP3 encoding in browser
- Never imported or referenced
- Pattern: Web Workers need explicit instantiation

**Verification:**
```bash
grep -r "audio-worker" src/
grep -r "new Worker" src/
grep -r "lamejs" src/ # Check if MP3 encoding is used elsewhere
```

**Check before deleting:**
- Verify no dynamic imports
- Confirm lamejs package can be removed
- Check if audio processing is done server-side only now

---

## Phase 6: Legacy Single-File Component (MEDIUM RISK)

### Primary Target
```
src/components/audio-transcription.tsx (1000+ lines)
```

**Dependencies to Check:**
1. `batch-transcription.tsx` imports it (line 9) but never renders it
2. Check for any tab/mode switching logic

**Related Components to Review:**
```
src/components/audio-splitter.tsx
src/components/floating-player.tsx
src/components/transcription-display.tsx
src/components/transcription-editor.tsx
```

**Analysis Needed:**
- Which of these are ONLY used by audio-transcription.tsx?
- Which are used by batch-transcription.tsx or other components?

**Verification Steps:**
```bash
# Find all imports of audio-transcription
grep -r "audio-transcription" src/

# For each related component, check usage
grep -r "AudioSplitter" src/
grep -r "FloatingPlayer" src/
grep -r "TranscriptionDisplay" src/
grep -r "TranscriptionEditor" src/
```

**Preliminary Analysis:**
- `TranscriptionDisplay` - likely used by batch components too (KEEP)
- `TranscriptionEditor` - likely used by batch components too (KEEP)
- `FloatingPlayer` - check usage
- `AudioSplitter` - check if only for single-file mode

---

## Phase 7: Duplicate Types (Low Risk)

### Files to Merge/Delete
```
src/utils/shared-types.ts
```

**Action:** Merge into `src/types/index.ts`

**Current Duplication:**
- `shared-types.ts` has: `ProgressTracker`, `AudioSourceState`, `TranscriptionState`
- `types/index.ts` has main domain types

**Why Separate?**
- Historical: `shared-types.ts` created for cross-cutting concerns
- Reality: All types should be in central `types/` directory

**Migration:**
1. Move types from `shared-types.ts` to `types/index.ts`
2. Update all imports
3. Delete `shared-types.ts`

**Import Update Pattern:**
```typescript
// Before
import { AudioSourceState } from '@/utils/shared-types';

// After
import { AudioSourceState } from '@/types';
```

---

## Phase 8: Utility Consolidation

### Files to Review
```
src/utils/index.ts
src/utils/time-utils.ts
```

**Issue:** `index.ts` has duplicate `formatTime` function

**Actions:**
1. Review all exports from `index.ts`
2. Move functions to appropriate specific util files
3. Keep `index.ts` as re-export hub only

---

## Deletion Summary Table

| File | Risk | Dependencies | Action |
|------|------|--------------|--------|
| test-email/route.ts | Zero | None | DELETE |
| test-blob-cleanup/route.ts | Zero | None | DELETE |
| debug-batch-items/route.ts | Zero | None | DELETE |
| quality-test/page.tsx | Zero | quality-test-ui | DELETE |
| quality-test-ui.tsx | Zero | quality-test.ts | DELETE |
| quality-test.ts | Zero | None | DELETE |
| youtube/proxy/route.ts | Zero | None | DELETE |
| summarize/route.ts | Low | openai.ts, prompts/ | DELETE |
| openai.ts | Low | Used by summarize only | DELETE |
| prompts/ | Low | Used by summarize only | DELETE |
| audio-worker.ts | Low | None (verify) | DELETE |
| audio-transcription.tsx | Medium | Check sub-components | DELETE |
| transcription-summarization.tsx | Low | Part of audio-transcription | DELETE |
| shared-types.ts | Low | Many (need migration) | MERGE & DELETE |

---

## Verification Commands

Run these before and after deletion to ensure no breakage:

```bash
# Build the project
npm run build

# Run batch tests
npm run test:batch

# Check for broken imports
npm run lint

# Search for any references to deleted files
grep -r "test-email\|test-blob\|debug-batch\|quality-test\|audio-worker\|summarize" src/

# Verify TypeScript compilation
npx tsc --noEmit
```

---

## Next Steps After Deletion

1. Update CLAUDE.md to remove references to deleted features
2. Update README.md to remove summarization from roadmap
3. Clean up package.json (remove lamejs if audio-worker deleted)
4. Check if OpenAI summarization prompts can be fully removed
5. Update environment variable documentation
