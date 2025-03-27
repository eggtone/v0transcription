import { toast } from "sonner";
import { extractYouTubeAudio } from "@/services/youtube";
import { formatFileSize, MP3Quality, DEFAULT_MP3_QUALITY } from "./audio-utils";
import { formatTime, formatExtractionCompletionTime } from "@/utils/time-utils";

/**
 * Common state reset function for both file upload and YouTube extraction
 */
export interface AudioSourceState {
  setAudioFile: (file: File | null) => void;
  setAudioUrl: (url: string | null) => void;
  setAudioFileName: (name: string) => void;
  setTranscriptionData: (data: any | null) => void;
  setFormattedTranscriptionText: (text: string) => void;
  setIsTranscribing: (isTranscribing: boolean) => void;
  setError: (error: string | null) => void;
  setYoutubeVideoInfo?: (info: any | null) => void;
  setYoutubeError?: (error: string | null) => void;
  setIsExtracting?: (isExtracting: boolean) => void;
  setAudioParts: (parts: any[]) => void;
}

/**
 * Reset all necessary state for a new audio source
 */
export function resetAudioSourceState(state: AudioSourceState) {
  // Reset transcription-related state
  state.setTranscriptionData(null);
  state.setFormattedTranscriptionText("");
  state.setIsTranscribing(false);
  state.setError(null);
  state.setAudioParts([]);
  
  // Reset YouTube-specific state if those setters exist
  if (state.setYoutubeVideoInfo) state.setYoutubeVideoInfo(null);
  if (state.setYoutubeError) state.setYoutubeError(null);
  if (state.setIsExtracting) state.setIsExtracting(false);
}

/**
 * Process a file upload and update the appropriate state
 */
export function processFileUpload(
  file: File,
  state: AudioSourceState
) {
  // Set the file info
  state.setAudioFile(file);
  state.setAudioFileName(file.name);
  
  // Revoke previous URL if it exists (handled by the calling component)
  
  // Create new URL
  const url = URL.createObjectURL(file);
  state.setAudioUrl(url);
  
  // Reset all relevant state
  resetAudioSourceState(state);
  
  return url;
}

/**
 * Extract audio from YouTube with progress tracking
 */
export async function processYoutubeExtraction(
  youtubeUrl: string,
  state: AudioSourceState,
  progressTracker: ProgressTracker,
  quality: MP3Quality = DEFAULT_MP3_QUALITY
) {
  if (!state.setIsExtracting || !state.setYoutubeError || !state.setYoutubeVideoInfo) {
    throw new Error("Missing required state setters for YouTube extraction");
  }
  
  try {
    // Set initial progress
    progressTracker.setProgress(10);
    
    // Reset transcription-related state
    resetAudioSourceState(state);
    
    // Indicate extraction is in progress
    state.setIsExtracting(true);
    
    // Extract audio from YouTube URL with progress callback
    const videoInfo = await extractYouTubeAudio(youtubeUrl, (progress) => {
      if (progressTracker.setElapsedTime) {
        progressTracker.setElapsedTime(progress.elapsed);
      }
      
      // Calculate percentage progress based on elapsed time
      // Assuming most extractions take around 30-60 seconds
      const estimatedPercent = Math.min(90, 10 + progress.elapsed * 2.6); // 2.6% per second after initial 10%, max 90%
      progressTracker.setProgress(estimatedPercent);
      
      // Log progress for debugging
      console.log(`Extracting: ${formatTime(progress.elapsed)} (${estimatedPercent}%)`);
    }, quality);
    
    // Set progress to complete
    progressTracker.setProgress(100);
    
    // Set the video info
    state.setYoutubeVideoInfo(videoInfo);
    
    // Set the audio URL and filename
    state.setAudioUrl(videoInfo.audioUrl);
    // Include duration in the filename for the audio player to detect
    state.setAudioFileName(`${videoInfo.title} (duration-${videoInfo.duration})`);
    
    // Download audio to a file object for the audio player section
    try {
      const response = await fetch(videoInfo.audioUrl);
      const blob = await response.blob();
      const file = new File([blob], `${videoInfo.title}.mp3`, { type: 'audio/mpeg' });
      
      // Update the audioFile state with the downloaded file
      state.setAudioFile(file);
      
      console.log(`YouTube audio downloaded: ${formatFileSize(file.size)}`);
      
      return {
        success: true,
        file,
        url: videoInfo.audioUrl,
        videoInfo,
        quality
      };
    } catch (downloadError) {
      console.error("Error downloading audio file:", downloadError);
      toast.error("Could not download audio file");
      // Still return success with the URL to allow playback even if the file couldn't be created
      return {
        success: true,
        file: null,
        url: videoInfo.audioUrl,
        videoInfo,
        quality
      };
    }
  } catch (err) {
    console.error("YouTube extraction error:", err);
    state.setYoutubeError(`Error: ${err instanceof Error ? err.message : "Unknown error occurred"}`);
    // Don't reset progress to 0 on error, keep it at the current level
    return {
      success: false,
      error: err
    };
  } finally {
    // Indicate extraction is finished
    state.setIsExtracting(false);
  }
}

/**
 * Common function to format elapsed time for display
 */
export function formatElapsedTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `Processing: ${minutes} min ${seconds} seconds...`;
}

/**
 * Common function to format device type based on model
 */
export function getDeviceTypeLabel(model: string, usedGpu?: boolean) {
  if (model.startsWith('groq')) {
    return 'Groq API';
  } else {
    return usedGpu ? 'GPU' : 'CPU';
  }
}

/**
 * Interface for progress tracking
 */
export interface ProgressTracker {
  setElapsedTime?: (time: number) => void;
  setProgress: (progress: number) => void;
} 