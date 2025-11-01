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
