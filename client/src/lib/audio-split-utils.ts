import { AudioPart } from "./audio-utils";
import { toast } from "sonner";
import { TranscriptionSegment, DetailedTranscription } from "@shared/types";
import { createSegmentsFromText } from "@/lib/utils";
import { formatTime, formatCompletionTime } from "@/lib/time-utils";
import { EnhancedQueuedAudioItem } from "@/stores/batchQueueStore";

// Type for the stored part results
export type StoredPartResult = {
  text: string;
  processingTime: number;
  segments?: TranscriptionSegment[];
  duration: number;
};

/**
 * Interface for split audio state, adding store update callback
 */
export interface SplitAudioState {
  itemId: string; // ID of the item being processed
  updateItemInStore: (id: string, updates: Partial<EnhancedQueuedAudioItem>) => void; // Callback to update store
  setIsTranscribingParts: (isTranscribing: boolean) => void;
  setIsTranscribing: (isTranscribing: boolean) => void;
  setError: (error: string | null) => void;
  setElapsedTime: (elapsedSeconds: number) => void;
  setProcessingTime: (processingTime: string | null) => void;
  setTranscriptionData: (data: DetailedTranscription | null) => void;
  setFormattedTranscriptionText: (text: string) => void;
  setCurrentPartIndex: (index: number) => void;
  setTranscriptionProgress: (progress: number) => void;
  getElapsedTime?: () => number;
}

/**
 * Type for the resume state passed into the function
 */
interface ResumeState {
  lastCompletedPartIndex: number;
  partResults: StoredPartResult[];
}

/**
 * Process transcription for split audio parts, supporting resume
 */
export async function processSplitAudioParts(
  audioParts: AudioPart[],
  model: string,
  state: SplitAudioState,
  resumeState?: ResumeState | null, // Optional resume state
  apiEndpoint: string = "/api/transcribe"
) {
  if (!audioParts.length) {
    throw new Error("No audio parts provided for transcription");
  }
  
  // --- Initialization --- 
  state.setIsTranscribingParts(true);
  state.setIsTranscribing(true);
  state.setError(null);
  state.setElapsedTime(0);
  state.setProcessingTime(null);
  state.setTranscriptionData(null);
  state.setFormattedTranscriptionText("");
  
  // Timer setup
  const startTime = Date.now();
  const getElapsedSeconds = () => {
    if (state.getElapsedTime) return state.getElapsedTime();
    return Math.floor((Date.now() - startTime) / 1000);
  };
  let timerInterval: NodeJS.Timeout | null = null;
  if (!state.getElapsedTime) {
    timerInterval = setInterval(() => {
      state.setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
  }

  // --- State Variables (initialized differently if resuming) ---
  let combinedText = "";
  let totalProcessingTime = 0;
  let allSegments: TranscriptionSegment[] = [];
  let segmentTimeOffset = 0;
  let startPartIndex = 0;
  const partResultsArray: StoredPartResult[] = []; // Use the detailed type

  // Apply resume state if provided
  if (resumeState && resumeState.lastCompletedPartIndex >= 0 && resumeState.partResults) {
    console.log(`Resuming transcription for item ${state.itemId} from part ${resumeState.lastCompletedPartIndex + 1}`);
    startPartIndex = resumeState.lastCompletedPartIndex + 1;
    partResultsArray.push(...resumeState.partResults);

    // Reconstruct state from previous results
    resumeState.partResults.forEach(result => {
      combinedText += (combinedText ? "\n" : "") + result.text;
      totalProcessingTime += result.processingTime;
      if (result.segments) {
         // Adjust segments based on accumulated duration
         const adjustedSegments = result.segments.map(seg => ({
           ...seg,
           start: seg.start + segmentTimeOffset,
           end: seg.end + segmentTimeOffset,
         }));
         allSegments.push(...adjustedSegments);
      }
      segmentTimeOffset += result.duration;
    });
    toast.info(`Resumed processing from part ${startPartIndex + 1}/${audioParts.length}`);
  } else {
    console.log(`Starting transcription for item ${state.itemId} from beginning.`);
  }
  
  // Initial progress update (consider adjusting based on resume?)
  state.setTranscriptionProgress(5); 

  // --- Main Processing Loop --- 
  try {
    for (let i = startPartIndex; i < audioParts.length; i++) {
      state.setCurrentPartIndex(i);
      
      // Calculate part-based progress
      const progressPercent = 5 + Math.round(((i + 1) / audioParts.length) * 90);
      state.setTranscriptionProgress(progressPercent);
      
      const part = audioParts[i];
      const partStartTime = Date.now();
      const partFile = new File([part.blob], part.name, { type: part.blob.type });
      const formData = new FormData();
      formData.append("file", partFile);
      formData.append("model", model);
      
      console.log(`[${state.itemId}] Starting transcription of part ${i+1}/${audioParts.length} (${part.size} bytes) with model: ${model}`);
      
      const response = await fetch(apiEndpoint, {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        // Handle API errors (keep existing detailed error handling)
        const errorData = await response.json().catch(() => ({ error: `HTTP error ${response.status}` })); // Graceful JSON parsing
        console.error(`[${state.itemId}] API error for part ${i+1}:`, errorData);
        const errorMessage = errorData.error || `Failed to transcribe part ${i+1}`;
        // Throw error to be caught by the outer catch block
        throw new Error(errorMessage); 
      }
      
      const data = await response.json();
      const partEndTime = Date.now();
      const partElapsedSeconds = Math.floor((partEndTime - partStartTime) / 1000);
      
      if (data.transcription && data.transcription.text) {
        const transcriptionResult = data.transcription as DetailedTranscription;
        const partProcessingTime = transcriptionResult.processingTime || partElapsedSeconds;
        
        // Create part result including segments and duration
        const partResult: StoredPartResult = {
          text: transcriptionResult.text,
          processingTime: partProcessingTime,
          segments: transcriptionResult.segments || [], // Store segments
          duration: part.duration // Store duration
        };
        
        partResultsArray.push(partResult);
        
        // ++ Update Store with Progress ++ 
        state.updateItemInStore(state.itemId, {
          lastCompletedPartIndex: i,
          partResults: [...partResultsArray] // Save current results
        });
        
        // Update local combined text
        combinedText += (combinedText ? "\n" : "") + partResult.text;

        // Process and add segments, adjusting for time offset
        if (partResult.segments && partResult.segments.length > 0) {
          const adjustedSegments = partResult.segments.map(segment => ({
            ...segment,
            start: segment.start + segmentTimeOffset,
            end: segment.end + segmentTimeOffset
          }));
          allSegments.push(...adjustedSegments);
        }
        
        // Update segment time offset *after* processing current part's segments
        segmentTimeOffset += part.duration;
        totalProcessingTime += partProcessingTime;
        
        // Update UI state for progressive display (optional)
        const progressiveTranscription: DetailedTranscription = {
          text: combinedText,
          language: transcriptionResult.language || "en",
          segments: allSegments.length > 0 ? allSegments : [], 
          processingTime: totalProcessingTime,
          usedGpu: model.includes("medium") || model.includes("large") || model.includes("groq")
        };
        state.setTranscriptionData(progressiveTranscription);
        state.setFormattedTranscriptionText(combinedText);
        
        // Display success toast
        const deviceType = model.startsWith('groq') ? 'Groq API' : (transcriptionResult.usedGpu ? 'GPU' : 'CPU');
        toast.success(
          `Part ${i+1}/${audioParts.length} complete in ${formatTime(partProcessingTime)} using ${deviceType}`, 
          { duration: 3000 }
        );
        console.log(`[${state.itemId}] Completed part ${i+1}/${audioParts.length} in ${formatTime(partProcessingTime)}`);
      } else {
        // Handle case where transcription is successful but text is empty
        console.warn(`[${state.itemId}] Transcription for part ${i+1} returned empty text.`);
        // Decide if this should be an error or just skipped
        // For now, let's treat it as success but store an empty result
        const emptyPartResult: StoredPartResult = {
          text: "",
          processingTime: partElapsedSeconds,
          segments: [],
          duration: part.duration
        };
        partResultsArray.push(emptyPartResult);
        state.updateItemInStore(state.itemId, {
          lastCompletedPartIndex: i,
          partResults: [...partResultsArray]
        });
        segmentTimeOffset += part.duration; // Still advance time offset
        totalProcessingTime += partElapsedSeconds;
      }
      
      // Update overall progress UI
      const completedProgress = 5 + Math.round(((i + 1) / audioParts.length) * 90);
      state.setTranscriptionProgress(completedProgress);
    }
    
    // --- Finalization (if loop completes) --- 
    state.setTranscriptionProgress(100);
    
    const finalProcessingTime = getElapsedSeconds();
    const finalCombinedTranscription: DetailedTranscription = {
      text: combinedText,
      language: "en", // Assume language from last part or default
      segments: allSegments.length > 0 ? allSegments : createSegmentsFromText(combinedText).segments,
      processingTime: totalProcessingTime > 0 ? totalProcessingTime : finalProcessingTime,
      usedGpu: model.includes("medium") || model.includes("large") || model.includes("groq")
    };
    
    // Update final UI state
    state.setTranscriptionData(finalCombinedTranscription);
    state.setFormattedTranscriptionText(combinedText);
    
    // Final toast message
    const finalDeviceType = model.startsWith('groq') ? 'Groq API' : (finalCombinedTranscription.usedGpu ? 'GPU' : 'CPU');
    const actualProcessingTime = finalCombinedTranscription.processingTime || finalProcessingTime;
    const timeMessage = formatCompletionTime(actualProcessingTime, finalDeviceType);
    state.setProcessingTime(timeMessage);
    toast.success(`All parts transcribed for item ${state.itemId}! ${timeMessage}`);
    
    // Return the final result
    return finalCombinedTranscription;

  } catch (err) {
    // --- Error Handling --- 
    console.error(`[${state.itemId}] Transcription error during part processing:`, err);
    // Use existing detailed error message generation
    let errorMessage = "Unknown error occurred during part processing";
    if (err instanceof Error) {
        const errorStr = err.message;
        if (errorStr.includes("Connection error") || errorStr.includes("Failed to fetch")) {
            errorMessage = "Network connection error accessing transcription API.";
        } else if (errorStr.includes("Invalid model") || errorStr.includes("Unknown model option")) {
            errorMessage = `Invalid model configuration: ${errorStr}`;
        } else if (errorStr.includes("API Key") || errorStr.includes("authentication")) {
            errorMessage = "Authentication failed with API. Check configuration.";
        } else if (model.startsWith('groq-')) {
            errorMessage = `Groq API error: ${errorStr}`;
        } else {
            errorMessage = errorStr;
        }
    }
    // Set error state but *don't* clear partial results from store here
    state.setError(`Error: ${errorMessage}`); 
    // Rethrow the error to be caught by the calling function (processAudioItem)
    throw new Error(errorMessage); 

  } finally {
    // --- Cleanup --- 
    if (timerInterval) {
      clearInterval(timerInterval);
    }
    // Ensure UI state reflects completion/stop
    state.setTranscriptionProgress(100); // Keep at 100 if finished or stopped
    state.setIsTranscribing(false);
    state.setIsTranscribingParts(false);
    state.setCurrentPartIndex(-1); // Reset part index display
  }
} 