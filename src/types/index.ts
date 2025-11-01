/**
 * Types for audio transcription application
 */

/**
 * Represents a segment of transcribed audio with timestamp and metadata
 */
export interface TranscriptionSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
}

/**
 * Complete transcription results with full text and segments
 */
export interface DetailedTranscription {
  text: string;
  segments: TranscriptionSegment[];
  language: string;
  processingTime?: number;  // Time taken to process in seconds
  usedGpu?: boolean;        // Whether GPU was used for transcription
}

/**
 * Display mode for showing transcription results
 */
export type DisplayMode = "compact" | "segments" | "segments-with-time" | "edit";

/**
 * Interface for transcription service clients
 */
export interface ApiClient {
  transcribeAudio(audioData: Buffer, filename: string): Promise<DetailedTranscription>;
}

/**
 * Local transcription result format
 */
export interface WhisperTranscriptionResult {
  transcription: string;
  segments?: TranscriptionSegment[];  // Segments with timestamps from JSON output
  outputPath: string;
  processingTime?: number;  // Time taken to process in seconds
  usedFallback?: boolean;   // Whether CPU fallback was used
}

/**
 * Represents an item in the batch processing queue.
 * This is the base type used for adding items.
 */
export interface QueuedAudioItem {
  id: string;
  name: string;
  source: 'local' | 'youtube-video' | 'youtube-playlist';
  file: File | null; // Local file blob or downloaded YT audio
  url: string | null;  // Original YT URL or blob URL for local files
  
  // Extraction/Download related (mostly for YT)
  extractionProgress?: number;
  extractionTime?: number;
  downloadProgress?: number;
  downloadTime?: number;
  extractionStatus?: 'pending' | 'extracting' | 'downloading' | 'completed' | 'failed';
  
  duration?: number; // Estimated or actual duration
  order: number;     // Display order in the queue

  // Transcription status (added later by store/processing logic)
  // transcriptionStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  // transcriptionData?: DetailedTranscription | null;
  // transcriptionError?: string;
  // transcriptionTime?: number;

  // Metadata
  metadata?: {
    youtubeInfo?: any; // Store result from /api/youtube/extract
    tempFileName?: string; // Name of the file saved in the OS temp dir by extract API
    playlistInfo?: { 
      position: number;
      totalItems: number;
      playlistId: string;
    };
  };
} 

/**
 * Progress tracking interface for UI updates (from shared-types.ts)
 */
export interface ProgressTracker {
  setProgress: (percent: number) => void;
  setElapsedTime?: (seconds: number) => void;
  progress?: number;
  elapsedTime?: number;
}

/**
 * Audio source state for components (from shared-types.ts)
 */
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

/**
 * Transcription state extending audio source state (from shared-types.ts)
 */
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
