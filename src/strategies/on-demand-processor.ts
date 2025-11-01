import { BaseProcessingStrategy, ProcessingStatus } from "./processing-strategy";
import { EnhancedQueuedAudioItem, useBatchQueueStore } from "@/store/batchQueueStore";
import { DetailedTranscription } from "@/types";
import { AudioPart, MP3Quality, splitAudioFile, getAudioDuration } from "@/utils/audio-utils";
import { processSplitAudioParts, SplitAudioState } from "@/utils/audio-split-utils";
import { ProcessTimer } from "@/utils/time-utils";
import { toast } from "sonner";

/**
 * On-demand processing strategy that processes items immediately
 * as they're added to the queue, with real-time progress tracking
 */
export class OnDemandProcessor extends BaseProcessingStrategy {
  private currentItemName = "";
  private currentItemProgress = 0;
  private stopProcessingFlag = false;
  private updateItem: (id: string, updates: Partial<EnhancedQueuedAudioItem>) => void;
  private getItemById: (id: string) => EnhancedQueuedAudioItem | undefined;
  private setProcessingStatus: (isProcessing: boolean, currentId?: string | null) => void;
  private setIndividualProgressMap?: (callback: (prev: Record<string, any>) => Record<string, any>) => void;

  constructor() {
    super();
    // Get store actions
    const store = useBatchQueueStore.getState();
    this.updateItem = store.updateItem;
    this.getItemById = store.getItemById;
    this.setProcessingStatus = store.setProcessingStatus;
  }

  canProcess(items: EnhancedQueuedAudioItem[]): boolean {
    // On-demand can process any items that have files and aren't currently processing
    return items.some(item => 
      item.file && 
      item.extractionStatus !== 'extracting' && 
      item.extractionStatus !== 'downloading' && 
      item.transcriptionStatus !== 'processing'
    );
  }

  async processItems(items: EnhancedQueuedAudioItem[]): Promise<void> {
    const processableItems = items.filter(item => 
      item.file && 
      item.extractionStatus !== 'extracting' && 
      item.extractionStatus !== 'downloading' && 
      item.transcriptionStatus !== 'processing' &&
      (item.transcriptionStatus === 'pending' || item.transcriptionStatus === 'failed')
    );

    if (processableItems.length === 0) {
      toast.info("No items ready for processing.");
      return;
    }

    this.isProcessing = true;
    this.totalCount = processableItems.length;
    this.processedCount = 0;
    this.failedCount = 0;
    this.stopProcessingFlag = false;

    toast.info(`Starting on-demand processing for ${processableItems.length} item(s)...`);
    this.setProcessingStatus(true);

    const selectedModel = useBatchQueueStore.getState().selectedModel;

    for (let i = 0; i < processableItems.length; i++) {
      if (this.stopProcessingFlag) {
        toast.warning("On-demand processing stopped by user.");
        break;
      }

      const item = processableItems[i];
      this.currentItemId = item.id;
      this.currentItemName = item.name;
      this.currentItemProgress = 0;

      try {
        await this.processAudioItem(item, selectedModel);
        this.processedCount++;
      } catch (error) {
        this.failedCount++;
        console.error(`Error processing item ${item.id}:`, error);
      }
    }

    this.isProcessing = false;
    this.setProcessingStatus(false);
    this.currentItemId = null;

    if (!this.stopProcessingFlag) {
      toast.success("On-demand processing complete.");
    }
  }

  async stopProcessing(): Promise<void> {
    this.stopProcessingFlag = true;
    toast.warning("Stopping on-demand processing...");
  }

  getConfigOptions() {
    return {
      supportedModels: [
        "groq-distil-whisper",
        "groq-whisper-large-v3",
        "groq-whisper-large-v3-turbo",
        "whisper-tiny",
        "whisper-base", 
        "whisper-small",
        "whisper-medium"
      ],
      requiresApiKey: false, // Can use local models
      supportsBatchProcessing: false,
      estimatedCostPer100MB: 0.01 // Groq pricing when using cloud models
    };
  }

  protected getMode(): 'on-demand' | 'batch' {
    return 'on-demand';
  }

  protected getCurrentItemName(): string {
    return this.currentItemName;
  }

  protected getCurrentItemProgress(): number {
    return this.currentItemProgress;
  }

  setProgressCallback(callback: (callback: (prev: Record<string, any>) => Record<string, any>) => void) {
    this.setIndividualProgressMap = callback;
  }

  // Method to be called from AudioQueueManager to sync with existing progress system
  syncWithProgressMap(setProgressMap: (callback: (prev: Record<string, any>) => Record<string, any>) => void) {
    this.setIndividualProgressMap = setProgressMap;
  }

  private determineSplitParams(fileSize: number): { needsSplit: boolean, numParts: number } {
    const MAX_PART_SIZE = 10 * 1024 * 1024; // 10MB
    if (fileSize <= MAX_PART_SIZE) {
      return { needsSplit: false, numParts: 1 };
    }
    const numParts = Math.ceil(fileSize / MAX_PART_SIZE);
    return { needsSplit: true, numParts };
  }

  private async processAudioItem(
    item: EnhancedQueuedAudioItem, 
    model: string
  ): Promise<DetailedTranscription | null> {
    console.log(`Processing audio item: ${item.name}`);
    let audioParts: AudioPart[] = [];
    const itemId = item.id;
    let currentItem = { ...item };

    // Update individual progress if callback is set
    if (this.setIndividualProgressMap) {
      this.setIndividualProgressMap(prev => ({
        ...prev,
        [itemId]: {
          isProcessing: true,
          progress: 0,
          isSplitting: false,
          splittingProgress: 0,
          currentPartIndex: null,
          totalParts: 1,
          fileName: item.name,
          fileSize: item.file?.size || 0,
          partElapsedTime: 0
        }
      }));
    }

    // PREPARATION STEP
    if (currentItem.extractionStatus === 'pending') {
      if (currentItem.source === 'local' && currentItem.file) {
        try {
          toast.info(`Preparing local file: ${currentItem.name}...`);
          let blobUrl = URL.createObjectURL(currentItem.file);
          const duration = currentItem.duration || await getAudioDuration(blobUrl);
          URL.revokeObjectURL(blobUrl);
          this.updateItem(itemId, { duration: duration, extractionStatus: 'completed' });
          currentItem = { ...currentItem, duration: duration, extractionStatus: 'completed' };
          toast.success(`Prepared local file: ${currentItem.name}`);
        } catch (err) {
          console.error(`Error getting duration for ${currentItem.name}:`, err);
          currentItem = { ...currentItem, extractionStatus: 'failed', extractionError: 'Failed to get duration' };
          toast.error(`Failed to prepare local file ${currentItem.name}: ${err instanceof Error ? err.message : 'Could not read duration'}`);
        }
      }
    }

    if (currentItem.extractionStatus === 'failed') {
      console.warn(`Skipping processing for failed item: ${currentItem.name}`);
      return null;
    }

    // SPLITTING STEP (if needed)
    let needsSplit = false;
    if (currentItem.file) {
      const { needsSplit: shouldSplit, numParts } = this.determineSplitParams(currentItem.file.size);
      needsSplit = shouldSplit;
      
      if (shouldSplit) {
        if (this.setIndividualProgressMap) {
          this.setIndividualProgressMap(prev => ({ 
            ...prev, 
            [itemId]: { 
              ...(prev[itemId] || {}),
              isProcessing: true,
              isSplitting: true, 
              splittingProgress: 0,
              totalParts: numParts,
              fileName: currentItem.name,
              fileSize: currentItem.file?.size || 0,
            } 
          }));
        }

        toast.info(`Splitting ${item.name} into ${numParts} parts...`);
        try {
          const splitStartTime = Date.now();
          const onSplitProgress = (progress: number) => {
            if (this.setIndividualProgressMap) {
              const elapsedSplitTime = Math.floor((Date.now() - splitStartTime) / 1000);
              this.setIndividualProgressMap(prev => ({
                ...prev, 
                [itemId]: { 
                  ...(prev[itemId]), 
                  splittingProgress: progress, 
                  partElapsedTime: elapsedSplitTime
                }
              }));
            }
          };
          
          audioParts = await splitAudioFile(currentItem.file, numParts, MP3Quality.HIGH, onSplitProgress);
          toast.success(`Split ${item.name} into ${numParts} parts.`);
          
        } catch (splitError) {
          const errorMsg = splitError instanceof Error ? splitError.message : 'Unknown split error';
          console.error(`Error splitting file ${currentItem.name}:`, splitError);
          if (this.setIndividualProgressMap) {
            this.setIndividualProgressMap(prev => ({ 
              ...prev, 
              [itemId]: { ...prev[itemId], isProcessing: false, isSplitting: false } 
            }));
          }
          this.updateItem(itemId, { 
            transcriptionStatus: 'failed', 
            transcriptionError: `Failed to split audio: ${errorMsg}` 
          });
          toast.error(`Failed to split audio for ${currentItem.name}`);
          throw new Error(errorMsg);
        }
      }
    }

    // TRANSCRIPTION STEP
    const startTime = Date.now();
    this.updateItem(itemId, { transcriptionStatus: 'processing', transcriptionError: undefined });
    
    let finalTranscription: DetailedTranscription | null = null;
    const partTimer = new ProcessTimer((secs) => {
      if (this.setIndividualProgressMap) {
        this.setIndividualProgressMap(prev => {
          const current = prev[itemId];
          if (current) {
            return { ...prev, [itemId]: { ...current, partElapsedTime: secs } };
          }
          return prev;
        });
      }
    });

    try {
      if (needsSplit && audioParts.length > 0) {
        // Handle split transcription
        const resumeState = 
          (item.lastCompletedPartIndex !== null && 
           item.lastCompletedPartIndex !== undefined && 
           item.lastCompletedPartIndex >= 0 && 
           item.partResults && item.partResults.length > 0) 
          ? { 
              lastCompletedPartIndex: item.lastCompletedPartIndex, 
              partResults: item.partResults 
            }
          : null;
          
        const splitAudioState: SplitAudioState = {
          itemId: item.id,
          updateItemInStore: this.updateItem,
          setCurrentPartIndex: (index: number) => {
            if (this.setIndividualProgressMap) {
              this.setIndividualProgressMap(prev => ({
                ...prev,
                [itemId]: { 
                  ...(prev[itemId]), 
                  currentPartIndex: index,
                  totalParts: audioParts.length,
                  isSplitting: false,
                  progress: 0
                }
              }));
            }
            partTimer.reset(); 
            partTimer.start();
          },
          setTranscriptionProgress: (progress: number) => {
            this.currentItemProgress = progress;
            if (this.setIndividualProgressMap) {
              this.setIndividualProgressMap(prev => ({
                ...prev,
                [itemId]: { 
                  ...(prev[itemId]), 
                  progress: progress 
                }
              }));
            }
          },
          setIsTranscribingParts: () => {},
          setIsTranscribing: () => {},
          setError: () => {},
          setElapsedTime: () => {},
          setProcessingTime: () => {},
          setTranscriptionData: () => {},
          setFormattedTranscriptionText: () => {},
          getElapsedTime: () => Math.floor((Date.now() - startTime) / 1000),
        };

        partTimer.start();
        finalTranscription = await processSplitAudioParts(
          audioParts, 
          model, 
          splitAudioState,
          resumeState
        );
        partTimer.stop();
        
        if (finalTranscription) {
          this.updateItem(item.id, { 
            lastCompletedPartIndex: null, 
            partResults: [] 
          });
          toast.success(`Transcription assembled for ${item.name}.`);
        }
      } else if (currentItem.file) {
        // Single file transcription
        partTimer.start();
        if (this.setIndividualProgressMap) {
          this.setIndividualProgressMap(prev => ({ 
            ...prev, 
            [itemId]: { 
              ...(prev[itemId]), 
              isProcessing: true, 
              isSplitting: false, 
              progress: 5,
              currentPartIndex: 0, 
              totalParts: 1 
            } 
          }));
        }
        
        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: (() => {
            const formData = new FormData();
            formData.append("file", item.file!, item.name);
            formData.append("model", model);
            return formData;
          })(),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Transcription API call failed (status ${response.status})`);
        }
        
        const result = await response.json();
        finalTranscription = result.transcription;
        
        if (this.setIndividualProgressMap) {
          this.setIndividualProgressMap(prev => ({ 
            ...prev, 
            [itemId]: { ...prev[itemId], progress: 100 } 
          }));
        }
        
        partTimer.stop();
        this.updateItem(item.id, { 
          lastCompletedPartIndex: null, 
          partResults: [] 
        });
        toast.success(`Transcription complete for ${item.name}.`);
      } else {
        throw new Error("No valid audio file available for transcription.");
      }
    } catch (transcriptionError) {
      console.error(`Transcription failed for ${item.name}:`, transcriptionError);
      partTimer.stop();
      
      if (this.setIndividualProgressMap) {
        this.setIndividualProgressMap(prev => ({ 
          ...prev, 
          [itemId]: { ...prev[itemId], isProcessing: false } 
        }));
      }
       
      let errorMessage = "Unknown transcription error";
      if (transcriptionError instanceof Error) {
        const errMsg = transcriptionError.message;
        if (errMsg.includes("Connection error") || errMsg.includes("Failed to fetch")) {
          errorMessage = "Network connection error. Please check your internet connection and try again.";
        } else if (errMsg.includes("Groq API") && errMsg.includes("API Key")) {
          errorMessage = "Groq API authentication failed. Please check your API key in settings.";
        } else if (errMsg.includes("Invalid model")) {
          errorMessage = "Invalid model configuration. Please select a different model.";
        } else {
          errorMessage = errMsg;
        }
      }
       
      throw new Error(errorMessage);
    } finally {
      partTimer.cleanup();
    }

    // Handle successful completion
    if (finalTranscription) {
      const endTime = Date.now();
      const processingTime = (endTime - startTime) / 1000;
      
      if (finalTranscription.text) {
        this.updateItem(item.id, { 
          transcriptionStatus: 'completed', 
          transcriptionData: finalTranscription, 
          transcriptionTime: processingTime,
          lastCompletedPartIndex: null,
          partResults: []
        });

        // Clean up temporary files if this was a YouTube extraction
        if (item.source.startsWith('youtube-') && item.metadata?.tempFileName) {
          try {
            console.log(`Cleaning up temporary file: ${item.metadata.tempFileName}`);
            await fetch("/api/cleanup-temp", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tempFileName: item.metadata.tempFileName }),
            });
          } catch (cleanupError) {
            console.warn(`Failed to clean up temporary file: ${cleanupError}`);
          }
        }
      } else {
        this.updateItem(item.id, {
          transcriptionStatus: 'failed',
          transcriptionError: "Transcription completed but empty text was returned. The audio may be silent or format not recognized.",
        });
        throw new Error("Transcription completed but empty text was returned.");
      }
    } else {
      this.updateItem(item.id, {
        transcriptionStatus: 'failed',
        transcriptionError: "Transcription process returned null result. This may be due to a network error or timeout.",
      });
      throw new Error("Transcription process returned null result.");
    }

    if (this.setIndividualProgressMap) {
      this.setIndividualProgressMap(prev => ({ 
        ...prev, 
        [itemId]: { 
          ...(prev[itemId]), 
          isProcessing: false, 
          progress: finalTranscription ? 100 : (prev[itemId]?.progress || 0)
        } 
      }));
    }
    
    return finalTranscription;
  }
}