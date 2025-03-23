import { YouTubeVideoInfo } from "@/services/youtube";

export interface ProgressTracker {
  /** Set the current progress percentage (0-100) */
  setProgress: (percent: number) => void;
  /** Set the elapsed time in seconds */
  setElapsedTime?: (seconds: number) => void;
  /** Current progress value */
  progress?: number;
  /** Current elapsed time in seconds */
  elapsedTime?: number;
}

export interface AudioSourceState {
  // State values
  audioFile?: File | null;
  audioUrl?: string | null;
  audioFileName?: string | null;
  isExtracting?: boolean;
  youtubeVideoInfo?: YouTubeVideoInfo | null;
  youtubeError?: string | null;
  
  // Setters
  setAudioFile?: (file: File | null) => void;
  setAudioUrl?: (url: string | null) => void;
  setAudioFileName?: (name: string | null) => void;
  setIsExtracting?: (isExtracting: boolean) => void;
  setYoutubeVideoInfo?: (info: YouTubeVideoInfo | null) => void;
  setYoutubeError?: (error: string | null) => void;
}

export interface TranscriptionState extends AudioSourceState {
  // State values
  isTranscribing?: boolean;
  transcriptionProgress?: number;
  elapsedTime?: number;
  selectedModel?: string;
  languageModelOptions?: string[];
  currentPart?: number;
  totalParts?: number;
  transcriptionError?: string | null;

  // Setters
  setIsTranscribing?: (isTranscribing: boolean) => void;
  setTranscriptionProgress?: (progress: number) => void;
  setElapsedTime?: (time: number) => void;
  setSelectedModel?: (model: string) => void;
  setLanguageModelOptions?: (options: string[]) => void;
  setCurrentPart?: (part: number) => void;
  setTotalParts?: (total: number) => void;
  setTranscriptionError?: (error: string | null) => void;
} 