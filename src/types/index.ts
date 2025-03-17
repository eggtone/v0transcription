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