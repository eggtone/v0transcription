import { AudioPart } from "./audio-utils";
import { toast } from "sonner";
import { TranscriptionSegment } from "@/types";
import { createSegmentsFromText } from "@/utils";
import { formatTime, formatCompletionTime } from "@/utils/time-utils";

/**
 * Interface for split audio state
 */
export interface SplitAudioState {
  setIsTranscribingParts: (isTranscribing: boolean) => void;
  setIsTranscribing: (isTranscribing: boolean) => void;
  setError: (error: string | null) => void;
  setElapsedTime: (time: number) => void;
  setProcessingTime: (time: string | null) => void;
  setTranscriptionData: (data: any | null) => void;
  setFormattedTranscriptionText: (text: string) => void;
  setPartResults: (results: {text: string, processingTime: number}[]) => void;
  setCurrentPartIndex: (index: number) => void;
  setTranscriptionProgress: (progress: number) => void;
}

/**
 * Process transcription for split audio parts
 */
export async function processSplitAudioParts(
  audioParts: AudioPart[],
  model: string,
  state: SplitAudioState,
  apiEndpoint: string = "/api/transcribe"
) {
  if (!audioParts.length) {
    throw new Error("No audio parts provided for transcription");
  }
  
  // Mark as processing
  state.setIsTranscribingParts(true);
  state.setIsTranscribing(true);
  state.setError(null);
  state.setElapsedTime(0);
  state.setProcessingTime(null);
  state.setTranscriptionData(null);
  state.setFormattedTranscriptionText("");
  state.setPartResults([]);
  
  // Start timing
  const startTime = Date.now();
  
  // Setup an interval to continuously update the elapsed time
  const timerInterval = setInterval(() => {
    const currentElapsed = Math.floor((Date.now() - startTime) / 1000);
    state.setElapsedTime(currentElapsed);
  }, 1000);
  
  try {
    let combinedText = "";
    let totalProcessingTime = 0;
    const partResultsArray: {text: string, processingTime: number}[] = [];
    const allSegments: TranscriptionSegment[] = [];
    let segmentTimeOffset = 0;
    
    // Initial progress update
    state.setTranscriptionProgress(5);
    
    // Process each part sequentially
    for (let i = 0; i < audioParts.length; i++) {
      state.setCurrentPartIndex(i);
      
      // Calculate part-based progress: initial 5% + progress through parts (up to 95%)
      const progressPercent = 5 + Math.round((i / audioParts.length) * 90);
      state.setTranscriptionProgress(progressPercent);
      
      const part = audioParts[i];
      const partStartTime = Date.now();
      
      // Create a blob to file to send to the API
      const partFile = new File([part.blob], part.name, { type: part.blob.type });
      
      // Create a FormData object
      const formData = new FormData();
      formData.append("file", partFile);
      formData.append("model", model);
      
      console.log(`Starting transcription of part ${i+1}/${audioParts.length} (${part.size} bytes)`);
      
      // Make a request to our API endpoint
      const response = await fetch(apiEndpoint, {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to transcribe part ${i+1}`);
      }
      
      const data = await response.json();
      const partEndTime = Date.now();
      const partElapsedSeconds = Math.floor((partEndTime - partStartTime) / 1000);
      
      if (data.transcription && data.transcription.text) {
        // Use the processing time from the API or calculate from elapsed time
        const partProcessingTime = data.transcription.processingTime || partElapsedSeconds;
        
        // Create part result
        const partResult = {
          text: data.transcription.text,
          processingTime: partProcessingTime
        };
        
        // Add to results array
        partResultsArray.push(partResult);
        state.setPartResults([...partResultsArray]);
        
        // Update combined text
        combinedText += (i > 0 ? "\n\n" : "") + `[Part ${i+1}]\n` + data.transcription.text;

        // Process segments - adjust timestamps for each part based on its position
        if (data.transcription.segments && data.transcription.segments.length > 0) {
          // Adjust segment timestamps to account for position in combined audio
          const adjustedSegments = data.transcription.segments.map((segment: TranscriptionSegment) => ({
            ...segment,
            start: segment.start + segmentTimeOffset,
            end: segment.end + segmentTimeOffset
          }));
          
          // Add segments to the combined list
          allSegments.push(...adjustedSegments);
        }
        
        // Update segment time offset for the next part
        segmentTimeOffset += part.duration;
        
        // Update transcription data after each part for progressive display
        const progressiveTranscription = {
          text: combinedText,
          language: "en",
          segments: allSegments.length > 0 ? allSegments : [], 
          processingTime: totalProcessingTime + partProcessingTime,
          usedGpu: model.includes("medium") || model.includes("large") || model.includes("groq")
        };
        
        state.setTranscriptionData(progressiveTranscription);
        state.setFormattedTranscriptionText(combinedText);
        
        totalProcessingTime += partProcessingTime;
        
        // Display processing time information for this part
        const deviceType = model.startsWith('groq') ? 'Groq API' : (data.transcription.usedGpu ? 'GPU' : 'CPU');
        
        toast.success(
          `Part ${i+1}/${audioParts.length} complete in ${formatTime(partProcessingTime)} using ${deviceType}`, 
          { duration: 3000 }
        );
        
        console.log(`Completed part ${i+1}/${audioParts.length} in ${formatTime(partProcessingTime)}`);
      }
      
      // Update progress
      const completedProgress = 5 + Math.round(((i + 1) / audioParts.length) * 90);
      state.setTranscriptionProgress(completedProgress);
    }
    
    // Set final progress to 100%
    state.setTranscriptionProgress(100);
    
    // Final update with complete data
    const finalProcessingTime = Math.floor((Date.now() - startTime) / 1000);
    const finalCombinedTranscription = {
      text: combinedText,
      language: "en",
      segments: allSegments.length > 0 ? allSegments : createSegmentsFromText(combinedText),
      processingTime: totalProcessingTime || finalProcessingTime,
      usedGpu: model.includes("medium") || model.includes("large") || model.includes("groq")
    };
    
    state.setTranscriptionData(finalCombinedTranscription);
    state.setFormattedTranscriptionText(combinedText);
    
    // Display final processing time information
    const deviceType = model.startsWith('groq') ? 'Groq API' : (finalCombinedTranscription.usedGpu ? 'GPU' : 'CPU');
    
    const timeMessage = formatCompletionTime(finalCombinedTranscription.processingTime, deviceType);
    state.setProcessingTime(timeMessage);
    toast.success(`All parts transcribed! ${timeMessage}`);
    
    return finalCombinedTranscription;
  } catch (err) {
    console.error("Transcription error:", err);
    state.setError(`Error: ${err instanceof Error ? err.message : "Unknown error occurred"}`);
    return null;
  } finally {
    // Clear the timer interval
    clearInterval(timerInterval);
    
    // Ensure we always keep the progress at 100% when finished
    state.setTranscriptionProgress(100);
    state.setIsTranscribing(false);
    state.setIsTranscribingParts(false);
    state.setCurrentPartIndex(-1);
  }
} 