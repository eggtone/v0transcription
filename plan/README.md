# Refactoring Plan - Quick Reference

This directory contains the complete refactoring plan for separating the v0transcription codebase into client, server, and shared modules.

## ⚠️ CRITICAL: Local Whisper Functionality is Fully Preserved

**Local Whisper models are NOT being removed:**
- ✅ `whisper.ts` service is **KEPT** (just moved to `server/src/services/`)
- ✅ All local models (tiny, base, small, medium) remain available
- ✅ Apple Silicon GPU (MPS) acceleration preserved
- ✅ Python-based local transcription unchanged

This refactor only removes unused UI and test code. Core transcription functionality untouched.

## 📋 Plan Documents

### [00-OVERVIEW.md](./00-OVERVIEW.md)
**Start here** - High-level analysis of current architecture, identified issues, and goals.

**Key Sections:**
- Current Architecture Status
- Major Issues Identified
- Proposed New Structure
- Files to Delete
- Risk Assessment

### [01-DELETION-PLAN.md](./01-DELETION-PLAN.md)
Detailed list of legacy and unused code to delete.

**Includes:**
- Phase-by-phase deletion plan
- Dependency analysis for each file
- Verification commands
- Risk assessment per file

**Summary:**
- ~15-20 files to delete
- Test/debug endpoints
- Legacy single-file mode (~1000 lines)
- Unused features (summarization, quality test)

### [02-SEPARATION-PLAN.md](./02-SEPARATION-PLAN.md)
Architecture for separating frontend and backend code.

**Includes:**
- Proposed directory structure
- Module boundaries and import rules
- TypeScript configuration
- File migration map
- Benefits for AI agents and developers

**Key Concept:**
```
client/     → React, components, UI, browser APIs
server/     → Node.js, API routes, FFmpeg, database
shared/     → TypeScript types only (no implementations)
```

### [03-CLAUDE-MD-PLAN.md](./03-CLAUDE-MD-PLAN.md)
Complete content for context-specific CLAUDE.md files.

**Files Provided:**
- Root `CLAUDE.md` - Project navigation
- `client/CLAUDE.md` - Frontend development guide
- `server/CLAUDE.md` - Backend development guide
- `shared/CLAUDE.md` - Type definition patterns

**Purpose:** Give AI agents (Claude Code) targeted guidance based on what module they're working on.

### [04-MIGRATION-STEPS.md](./04-MIGRATION-STEPS.md)
**Step-by-step execution guide** - Follow this to actually perform the refactor.

**Phases:**
1. **Phase 0:** Preparation (backups, testing)
2. **Phase 1:** Delete legacy code (5 steps)
3. **Phase 2:** Consolidate types (4 steps)
4. **Phase 3:** Create directory structure (2 steps)
5. **Phase 4:** Move shared types (4 steps)
6. **Phase 5:** Move server code (7 steps)
7. **Phase 6:** Move client code (7 steps)
8. **Phase 7:** Update Next.js config (3 steps)
9. **Phase 8:** Clean up old files (3 steps)
10. **Phase 9:** Add CLAUDE.md files (2 steps)
11. **Phase 10:** Final verification (4 steps)

**Each step includes:**
- Exact commands to run
- Files to modify
- Verification steps
- Git commit message

**Time Estimate:** 17-22 hours total

---

## 🚀 Quick Start

### If you're ready to execute:

1. **Read 00-OVERVIEW.md** to understand what we're doing and why
2. **Review 01-DELETION-PLAN.md** to see what will be deleted
3. **Skim 02-SEPARATION-PLAN.md** to understand the target architecture
4. **Follow 04-MIGRATION-STEPS.md** step-by-step

### If you want to discuss first:

1. Read **00-OVERVIEW.md** for context
2. Note any concerns about:
   - Files marked for deletion
   - Proposed structure
   - Time estimate
3. Discuss modifications before executing

---

## ⚠️ Important Decisions

### Should we keep the summarization feature?

**Location:** Phase 1, Step 1.5 in migration steps

**Current Status:**
- ✅ Fully implemented API endpoint (`/api/summarize`)
- ✅ Complete UI component
- ❌ NOT exposed in current UI
- ❌ Only imported by unused `audio-transcription.tsx`

**Options:**
1. **Delete** - Simplifies codebase, can restore from git if needed
2. **Keep** - Move to future features branch, might be useful later

**Recommendation in plan:** Delete for now, create feature branch first

**Dependencies:**
- `openai` package must be KEPT (used by Groq service)
- Only delete summarization-specific files

### Single-file mode removal

**Component:** `audio-transcription.tsx` (1000+ lines)

**Status:**
- Imported by `batch-transcription.tsx` but never rendered
- `activeMode` state hardcoded to "queue"
- No UI to switch modes

**Decision:** SAFE TO DELETE (thoroughly analyzed in plan)

---

## 📊 Metrics

### Code Reduction
- **Deleted:** ~15-20 files
- **Lines removed:** ~2000-3000 (estimate)
- **Components removed:** 3-5

### Code Organization
- **Before:** 1 module (src/)
- **After:** 3 modules (client/, server/, shared/)
- **TypeScript configs:** 4 (root + 3 modules)
- **CLAUDE.md files:** 4 (root + 3 modules)

### Import Rules Enforced
- ❌ client/ CANNOT import server/
- ❌ server/ CANNOT import client/
- ✅ Both CAN import shared/types
- ✅ shared/ imports NOTHING

---

## 🧪 Testing Strategy

### After Each Phase
```bash
npm run build      # TypeScript compilation
npm run lint       # ESLint
npm run test:batch # Batch system tests
```

### Final Verification
- [ ] All builds pass
- [ ] Manual testing in browser
- [ ] All features work (local, YouTube, batch)
- [ ] Import boundaries enforced by TypeScript
- [ ] Documentation updated

---

## 🔄 Rollback Strategy

Every phase is a separate git commit:

```bash
# Rollback one phase
git reset --hard HEAD~1

# Rollback entire refactor
git reset --hard origin/main
```

**Backup:**
- Create feature branch before starting
- Keep database backup
- Keep old code until refactor is production-tested

---

## 📈 Benefits

### For Developers
- Clear mental model (client vs server)
- TypeScript prevents wrong imports
- Easier onboarding
- Better code review

### For AI Agents
- Context-specific CLAUDE.md files
- Reduced context (only relevant code)
- Clear constraints and patterns
- Module-specific guidance

### For Maintenance
- Remove ~2000 lines of dead code
- Clear module boundaries
- Can split into separate repos later
- Easier to scale team

---

## 🎯 Success Criteria

- [x] Complete plan documented
- [ ] Plan reviewed and approved
- [ ] Execution started
- [ ] Phase 1 complete (deletions)
- [ ] Phase 2-4 complete (setup)
- [ ] Phase 5-6 complete (migration)
- [ ] Phase 7-8 complete (integration)
- [ ] Phase 9 complete (documentation)
- [ ] Phase 10 complete (verification)
- [ ] All tests passing
- [ ] Production deployment successful

---

## 📞 Questions?

Review the detailed plans:
- Architecture questions → `02-SEPARATION-PLAN.md`
- What gets deleted → `01-DELETION-PLAN.md`
- How to execute → `04-MIGRATION-STEPS.md`
- Overall context → `00-OVERVIEW.md`

Ready to proceed? Start with `04-MIGRATION-STEPS.md` Phase 0.
