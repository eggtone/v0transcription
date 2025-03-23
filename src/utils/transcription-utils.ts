import { toast } from "sonner";
import { transcribeAudio } from "@/services/api-client";
import { TranscriptionSegment, DetailedTranscription } from "@/types";
import { AudioPart } from "@/utils/audio-utils";
import { formatTime, formatCompletionTime } from "@/utils/time-utils";

/**
 * Interface for transcription state management
 */
export interface TranscriptionState {
  setIsTranscribing: (isTranscribing: boolean) => void;
  setTranscriptionData: (data: DetailedTranscription | null) => void;
  setTranscriptionProgress: (progress: number) => void;
  setFormattedTranscriptionText: (text: string) => void;
  setError: (error: string | null) => void;
  setDeviceType?: (type: string) => void;
  setModel?: (model: string) => void;
  setElapsedTime?: (time: number) => void;
  setProcessingTime?: (time: string | null) => void;
  elapsedTime?: number;
}

/**
 * Process audio transcription with progress tracking
 */
export async function processTranscription(
  audioFile: File | null,
  audioUrl: string | null,
  audioFileName: string,
  audioParts: AudioPart[],
  model: string,
  language: string,
  state: TranscriptionState
) {
  // Safety check
  if (!audioFile && !audioUrl) {
    toast.error("No audio source provided");
    return;
  }

  try {
    // Reset and prepare state
    state.setIsTranscribing(true);
    state.setTranscriptionProgress(10); // Start with initial progress (10%)
    state.setTranscriptionData(null);
    state.setFormattedTranscriptionText("");
    state.setError(null);
    
    // If device type setter exists, update it
    if (state.setDeviceType) {
      state.setDeviceType("Processing...");
    }
    
    // If model setter exists, update it
    if (state.setModel) {
      state.setModel(model);
    }

    // Prepare file or parts for transcription
    const source = audioParts.length > 0 ? audioParts : audioFile;
    
    // Perform transcription with progress tracking
    const data = await transcribeAudio(
      source, 
      model, 
      language,
      (progress) => {
        state.setTranscriptionProgress(progress);
      }
    );

    // Ensure progress is at 100% when complete
    state.setTranscriptionProgress(100);
    
    // Update state with results
    state.setTranscriptionData(data);
    
    // Create formatted text from segments
    const formattedText = formatTranscriptionText(data.segments, data.language);
    state.setFormattedTranscriptionText(formattedText);
    
    // Calculate processing time message with device type
    const deviceType = model.startsWith('groq') ? 'Groq API' : (data.usedGpu ? 'GPU' : 'CPU');
    
    // Update device type if setter exists
    if (state.setDeviceType) {
      state.setDeviceType(deviceType);
    }
    
    // Set processing time if setter and elapsed time exist
    if (state.setProcessingTime && state.elapsedTime) {
      const timeMessage = formatCompletionTime(state.elapsedTime, deviceType);
      state.setProcessingTime(timeMessage);
    }

    toast.success("Transcription complete!");
    return data;
  } catch (err) {
    console.error("Transcription error:", err);
    state.setError(`Error: ${err instanceof Error ? err.message : "Unknown error occurred"}`);
    toast.error("Transcription failed");
    // Don't reset progress on error
  } finally {
    state.setIsTranscribing(false);
  }
}

/**
 * Format transcription segments into human-readable text
 */
export function formatTranscriptionText(segments: TranscriptionSegment[], language: string) {
  return segments
    .map((segment) => {
      const startTime = formatTimestamp(segment.start);
      return `[${startTime}] ${segment.text}`;
    })
    .join("\n\n");
}

/**
 * Format timestamp in [hh:mm:ss] format
 */
export function formatTimestamp(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  const hStr = h > 0 ? `${h}:` : '';
  const mStr = h > 0 ? m.toString().padStart(2, '0') : m.toString();
  const sStr = s.toString().padStart(2, '0');
  
  return `${hStr}${mStr}:${sStr}`;
} 