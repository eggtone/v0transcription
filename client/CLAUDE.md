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
