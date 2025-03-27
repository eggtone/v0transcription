"use client";

import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Play, StopCircle, Download, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import AudioTranscription from "@/components/audio-transcription";
import BatchProcessor, { QueuedAudioItem, BatchProcessorHandle } from "@/components/batch-processor";
import { formatTime, formatCompletionTime, ProcessTimer } from "@/utils/time-utils";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DetailedTranscription, TranscriptionSegment } from "@/types";
import { AudioPart, MP3Quality, splitAudioFile, formatFileSize } from "@/utils/audio-utils";
import { processSplitAudioParts } from "@/utils/audio-split-utils";
import JSZip from "jszip";

// Updated QueuedAudioItem interface with transcription properties
interface EnhancedQueuedAudioItem extends QueuedAudioItem {
  transcriptionStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  transcriptionData?: DetailedTranscription;
  transcriptionError?: string;
  transcriptionTime?: number;
}

export default function BatchTranscription() {
  // State for selected mode
  const [activeMode, setActiveMode] = useState<"single" | "batch">("batch");
  
  // State for batch transcription
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [currentBatchItem, setCurrentBatchItem] = useState<number | null>(null);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchResults, setBatchResults] = useState<Array<{ id: string, name: string, text: string }>>([]);
  const [batchElapsedTime, setBatchElapsedTime] = useState(0);
  const [batchStartTime, setBatchStartTime] = useState(0);
  
  // Add state for tracking part-by-part progress
  const [currentPartIndex, setCurrentPartIndex] = useState<number | null>(null);
  const [totalParts, setTotalParts] = useState<number>(0);
  const [currentFileName, setCurrentFileName] = useState<string>("");
  const [currentFileSize, setCurrentFileSize] = useState<number>(0);
  
  // Add state for splitting progress and part timing
  const [isSplittingFile, setIsSplittingFile] = useState(false);
  const [splittingProgress, setSplittingProgress] = useState(0);
  const [splitTimeElapsed, setSplitTimeElapsed] = useState(0);
  const [currentPartStartTime, setCurrentPartStartTime] = useState(0);
  const [currentPartElapsedTime, setCurrentPartElapsedTime] = useState(0);
  
  // Replace timer with ProcessTimer
  const batchTimerRef = useRef<ProcessTimer | null>(null);
  
  // Add model selection (default to groq english model)
  const [selectedModel, setSelectedModel] = useState<string>("groq-distil-whisper");
  
  // Reference to audio queue for batch processing
  const batchProcessorRef = useRef<BatchProcessorHandle>(null);
  
  // Add state to track queue length
  const [queueLength, setQueueLength] = useState(0);
  
  // Add force update counter
  const [forceUpdate, setForceUpdate] = useState(0);
  
  // Add state to track individual file reprocessing progress
  const [individualProgressMap, setIndividualProgressMap] = useState<Record<string, {
    isProcessing: boolean;
    progress: number;
    isSplitting: boolean;
    splittingProgress: number;
    currentPartIndex: number | null;
    totalParts: number;
    fileName: string;
    fileSize: number;
    partElapsedTime: number;
  }>>({});
  
  // Helper to get the current audio queue
  const getAudioQueue = (): QueuedAudioItem[] => {
    if (batchProcessorRef.current) {
      return batchProcessorRef.current.audioQueue;
    }
    return [];
  };
  
  // Update queue length when the component renders
  useEffect(() => {
    const intervalId = setInterval(() => {
      const currentLength = getAudioQueue().length;
      if (currentLength !== queueLength) {
        setQueueLength(currentLength);
      }
    }, 500); // Check every 500ms
    
    return () => clearInterval(intervalId);
  }, [queueLength]);

  // Initialize the ProcessTimer on component mount
  useEffect(() => {
    batchTimerRef.current = new ProcessTimer((seconds) => {
      setBatchElapsedTime(seconds);
    });

    // Clean up timer on unmount
    return () => {
      if (batchTimerRef.current) {
        batchTimerRef.current.cleanup();
      }
    };
  }, []);
  
  // Helper function to determine if a file needs splitting
  function determineSplitParams(fileSize: number): { 
    needsSplit: boolean, 
    numParts: number 
  } {
    const MAX_PART_SIZE = 10 * 1024 * 1024; // 10MB
    if (fileSize <= MAX_PART_SIZE) {
      return { needsSplit: false, numParts: 1 };
    }
    
    const numParts = Math.ceil(fileSize / MAX_PART_SIZE);
    return { needsSplit: true, numParts };
  }
  
  // Function to update item status in queue
  const updateItemStatus = (
    id: string, 
    status: 'pending' | 'processing' | 'completed' | 'failed',
    data?: DetailedTranscription | null,
    errorMessage?: string
  ) => {
    if (batchProcessorRef.current) {
      // Immediately get the current queue to ensure we have the latest state
      const currentQueue = [...getAudioQueue()];
      
      console.log(`Updating item ${id} to status: ${status}`, { currentQueue });
      
      // Create a new array with the updated item
      const updatedQueue = currentQueue.map(queueItem => {
        if (queueItem.id === id) {
          // Only update the specific item that matches the ID
          const transcriptionTime = status === 'completed' ? 
            (batchTimerRef.current?.getElapsedSeconds() || 0) : undefined;
          
          console.log(`Updating queue item ${id} from status ${queueItem.transcriptionStatus} to ${status}`);
          
          return {
            ...queueItem,
            transcriptionStatus: status,
            transcriptionData: data || undefined,
            transcriptionError: errorMessage,
            transcriptionTime
          } as EnhancedQueuedAudioItem;
        }
        // Important: preserve the existing state for all other items
        return queueItem;
      });
      
      console.log('Updated queue:', updatedQueue);
      
      // Update the queue directly rather than through a state setter
      batchProcessorRef.current.updateQueue(updatedQueue);
      
      // Force a re-render by updating a state variable
      setForceUpdate(prev => prev + 1);
      
      // Display toast for debugging
      if (status === 'completed') {
        toast.success(`Transcription completed for item ${id}`);
      } else if (status === 'failed') {
        toast.error(`Transcription failed for item ${id}: ${errorMessage}`);
      }
    }
  };
  
  // Process an individual audio item
  const processAudioItem = async (
    item: EnhancedQueuedAudioItem, 
    model: string,
    individualItemId?: string
  ): Promise<DetailedTranscription | null> => {
    console.log(`Processing audio item: ${item.name}`);
    
    let needsSplit = false;
    let audioParts: AudioPart[] = [];
    
    // Set current file information - either for batch or individual processing
    setCurrentFileName(item.name);
    setCurrentFileSize(item.file?.size || 0);
    setCurrentPartIndex(null);
    setTotalParts(1);
    
    // If processing individually, update the individual progress map
    if (individualItemId) {
      setIndividualProgressMap(prev => ({
        ...prev,
        [individualItemId]: {
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
    
    if (item.file) {
      const { needsSplit: shouldSplit, numParts } = determineSplitParams(item.file.size);
      needsSplit = shouldSplit;
      
      if (shouldSplit) {
        // Start tracking splitting progress
        setIsSplittingFile(true);
        setSplittingProgress(0);
        const splitStartTime = Date.now();
        
        // Update total parts count
        setTotalParts(numParts);
        
        // If processing individually, update the individual progress map
        if (individualItemId) {
          setIndividualProgressMap(prev => ({
            ...prev,
            [individualItemId]: {
              ...prev[individualItemId],
              isSplitting: true,
              totalParts: numParts
            }
          }));
        }
        
        // Split the file
        toast.info(`Splitting ${item.name} into ${numParts} parts for processing...`);
        try {
          // Create a progress tracker for splitting
          const onSplitProgress = (progress: number) => {
            setSplittingProgress(progress);
            // Update time spent splitting
            setSplitTimeElapsed(Math.floor((Date.now() - splitStartTime) / 1000));
            
            // Also update individual progress if applicable
            if (individualItemId) {
              setIndividualProgressMap(prev => ({
                ...prev,
                [individualItemId]: {
                  ...prev[individualItemId],
                  splittingProgress: progress
                }
              }));
            }
          };
          
          audioParts = await splitAudioFile(item.file, numParts, MP3Quality.LOW, onSplitProgress);
          
          // Calculate final splitting time
          const finalSplitTime = Math.floor((Date.now() - splitStartTime) / 1000);
          setSplitTimeElapsed(finalSplitTime);
          
          // Update individual tracking if applicable
          if (individualItemId) {
            setIndividualProgressMap(prev => ({
              ...prev,
              [individualItemId]: {
                ...prev[individualItemId],
                isSplitting: false,
                splittingProgress: 100
              }
            }));
          }
          
          toast.success(`File split complete in ${formatTime(finalSplitTime)}`);
        } catch (error) {
          console.error(`Error splitting ${item.name}:`, error);
          setIsSplittingFile(false);
          
          // Update individual tracking if applicable
          if (individualItemId) {
            setIndividualProgressMap(prev => ({
              ...prev,
              [individualItemId]: {
                ...prev[individualItemId],
                isSplitting: false
              }
            }));
          }
          
          throw error;
        } finally {
          setIsSplittingFile(false);
        }
      }
    }
    
    let transcriptionResult: DetailedTranscription | null = null;
    
    if (needsSplit && audioParts.length > 0) {
      // Process split audio parts
      const splitAudioState = {
        setIsTranscribingParts: () => {},
        setIsTranscribing: () => {},
        setError: () => {},
        setElapsedTime: () => {},
        setProcessingTime: () => {},
        setTranscriptionData: (data: DetailedTranscription | null) => {
          transcriptionResult = data;
        },
        setFormattedTranscriptionText: () => {},
        setPartResults: () => {},
        setCurrentPartIndex: (index: number) => {
          // Update progress based on current part
          if (index >= 0) {
            setCurrentPartIndex(index);
            
            // Track part start time for new parts
            if (currentPartIndex !== index) {
              setCurrentPartStartTime(Date.now());
            }
            
            // Start interval to update part elapsed time
            const partTimerInterval = setInterval(() => {
              const elapsed = Math.floor((Date.now() - currentPartStartTime) / 1000);
              setCurrentPartElapsedTime(elapsed);
              
              // Also update individual progress if applicable
              if (individualItemId) {
                setIndividualProgressMap(prev => ({
                  ...prev,
                  [individualItemId]: {
                    ...prev[individualItemId],
                    currentPartIndex: index,
                    partElapsedTime: elapsed,
                    progress: Math.round((index / audioParts.length) * 100)
                  }
                }));
              }
            }, 1000);
            
            // Clean up interval when component unmounts or part changes
            return () => clearInterval(partTimerInterval);
          }
        },
        setTranscriptionProgress: (progress: number) => {
          // Update individual progress if applicable
          if (individualItemId) {
            setIndividualProgressMap(prev => ({
              ...prev,
              [individualItemId]: {
                ...prev[individualItemId],
                progress: progress
              }
            }));
          }
        },
        getElapsedTime: () => batchTimerRef.current?.getElapsedSeconds() || 0
      };
      
      try {
        const result = await processSplitAudioParts(
          audioParts,
          model,
          splitAudioState
        );
        
        if (result) {
          transcriptionResult = result;
          
          // Add to batch results
          setBatchResults(prev => [
            ...prev,
            {
              id: item.id,
              name: item.name,
              text: result.text
            }
          ]);
        }
      } catch (error) {
        console.error(`Error transcribing split parts for ${item.name}:`, error);
        throw error;
      } finally {
        // Clean up audio parts
        audioParts.forEach(part => {
          if (part.url) {
            URL.revokeObjectURL(part.url);
          }
        });
      }
    } else {
      // Process single file directly
      try {
        let formData = new FormData();
        
        if (item.file) {
          formData.append("file", item.file);
        } else if (item.url) {
          formData.append("url", item.url);
        }
        
        // Add model settings
        formData.append("model", model);
        
        // Call the transcription API
        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          const errorMessage = errorData.error || `Failed to transcribe ${item.name}`;
          throw new Error(errorMessage);
        }
        
        const result = await response.json();
        
        if (result.transcription) {
          transcriptionResult = result.transcription;
          
          // Add to batch results
          setBatchResults(prev => [
            ...prev,
            {
              id: item.id,
              name: item.name,
              text: result.transcription.text
            }
          ]);
        }
      } catch (error) {
        console.error(`Error transcribing ${item.name}:`, error);
        throw error;
      }
    }
    
    return transcriptionResult;
  };
  
  // Add helper functions before the return statement
  // Helper function to check for unprocessed items
  const hasUnprocessedItems = (): boolean => {
    return getAudioQueue().some(item => {
      return !item.transcriptionStatus || 
             item.transcriptionStatus === 'pending' || 
             item.transcriptionStatus === 'failed';
    });
  };

  // Helper function to get count of completed items
  const getCompletedItemsCount = (): number => {
    return getAudioQueue().filter(item => 
      item.transcriptionStatus === 'completed' && item.transcriptionData
    ).length;
  };

  // Add a helper function to get the count of files with audio
  const getFilesWithAudioCount = () => {
    return getAudioQueue().filter(item => item.file || item.url).length;
  };

  // Add a helper function to determine if download button should be enabled
  const isDownloadAllEnabled = () => {
    const queue = getAudioQueue();
    // Enable if there are any files with audio content or completed transcriptions
    return queue.some(item => 
      item.transcriptionStatus === 'completed' || item.file || item.url
    );
  };

  // Handle batch processing all files
  const handleStartBatchProcessingAll = async () => {
    if (isProcessingBatch) {
      toast.error("A batch process is already running");
      return;
    }
    
    const audioQueue = getAudioQueue();
    if (audioQueue.length === 0) {
      toast.error("No items in queue to process");
      return;
    }
    
    // Get the model from BatchProcessor component if available
    const batchModel = batchProcessorRef.current?.selectedModel || selectedModel;
    
    try {
      setIsProcessingBatch(true);
      setBatchProgress(0);
      
      // Reset and start the timer properly
      if (batchTimerRef.current) {
        batchTimerRef.current.reset();
        batchTimerRef.current.start();
      }
      
      // Process each item in the queue sequentially
      let success = 0;
      let failure = 0;
      
      for (let i = 0; i < audioQueue.length; i++) {
        setCurrentBatchItem(i);
        const item = audioQueue[i];
        
        try {
          await processQueueItem(item, batchModel);
          success++;
        } catch (error) {
          console.error(`Error processing item ${i}:`, error);
          failure++;
        }
      }
      
      // Stop the timer properly
      if (batchTimerRef.current) {
        batchTimerRef.current.stop();
      }
      
      if (success === audioQueue.length) {
        toast.success(`Successfully processed all ${success} items`);
      } else {
        toast.info(`Completed batch processing: ${success} successful, ${failure} failed`);
      }
      
    } catch (error) {
      console.error("Error during batch processing:", error);
      toast.error(`Batch processing error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsProcessingBatch(false);
      setCurrentBatchItem(null);
    }
  };
  
  // Handle batch processing new files only
  const handleStartBatchProcessingNew = async () => {
    if (isProcessingBatch) {
      toast.error("A batch process is already running");
      return;
    }
    
    const audioQueue = getAudioQueue();
    if (audioQueue.length === 0) {
      toast.error("No items in queue to process");
      return;
    }
    
    const unprocessedItems = audioQueue.filter(
      item => !item.transcriptionStatus || item.transcriptionStatus === 'pending'
    );
    
    if (unprocessedItems.length === 0) {
      toast.info("No new (unprocessed) items in queue");
      return;
    }
    
    // Get the model from BatchProcessor component if available
    const batchModel = batchProcessorRef.current?.selectedModel || selectedModel;
    
    try {
      setIsProcessingBatch(true);
      setBatchProgress(0);
      
      // Reset and start the timer properly
      if (batchTimerRef.current) {
        batchTimerRef.current.reset();
        batchTimerRef.current.start();
      }
      
      // Process each unprocessed item in the queue sequentially
      let success = 0;
      let failure = 0;
      
      for (let i = 0; i < audioQueue.length; i++) {
        const item = audioQueue[i];
        
        // Skip already processed items
        if (item.transcriptionStatus && item.transcriptionStatus !== 'pending') continue;
        
        setCurrentBatchItem(i);
        
        try {
          await processQueueItem(item, batchModel);
          success++;
        } catch (error) {
          console.error(`Error processing item ${i}:`, error);
          failure++;
        }
      }
      
      // Stop the timer properly
      if (batchTimerRef.current) {
        batchTimerRef.current.stop();
      }
      
      if (success === unprocessedItems.length) {
        toast.success(`Successfully processed all ${success} new items`);
      } else {
        toast.info(`Completed processing: ${success} successful, ${failure} failed`);
      }
      
    } catch (error) {
      console.error("Error during batch processing:", error);
      toast.error(`Batch processing error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsProcessingBatch(false);
      setCurrentBatchItem(null);
    }
  };
  
  // Handle stop batch processing
  const handleStopBatchProcessing = () => {
    if (!isProcessingBatch) return;
    
    // Stop timer properly
    if (batchTimerRef.current) {
      batchTimerRef.current.stop();
    }
    
    setIsProcessingBatch(false);
    setCurrentBatchItem(null);
    
    // Reset part tracking state
    setCurrentPartIndex(null);
    setTotalParts(0);
    setCurrentFileName("");
    setCurrentFileSize(0);
    
    toast.info("Batch processing stopped");
  };
  
  // Handle downloading all transcriptions
  const handleDownloadAllTranscriptions = () => {
    const audioQueue = getAudioQueue();
    
    // Filter to only completed transcriptions
    const completedItems = audioQueue.filter(
      item => item.transcriptionStatus === 'completed' && item.transcriptionData
    );
    
    if (completedItems.length === 0) {
      toast.error("No completed transcriptions found");
      return;
    }
    
    let downloadCount = 0;
    
    // Process each transcription
    for (const item of completedItems) {
      try {
        const baseFileName = item.name.replace(/\.[^/.]+$/, '');
        const zip = new JSZip();
        
        // Add text transcription
        zip.file(`${baseFileName}_transcript.txt`, item.transcriptionData.text);
        
        // Add JSON transcription
        zip.file(`${baseFileName}_transcript.json`, JSON.stringify(item.transcriptionData, null, 2));
        
        // Add time-segmented transcription
        const timeSegments = item.transcriptionData.segments.map((seg: any) => 
          `[${formatTime(seg.start)} → ${formatTime(seg.end)}] ${seg.text}`
        ).join('\n\n');
        zip.file(`${baseFileName}_timeseg.txt`, timeSegments);
        
        // Generate the ZIP and trigger download
        zip.generateAsync({ type: 'blob' }).then(content => {
          const url = URL.createObjectURL(content);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${baseFileName}_transcription.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        });
        
        downloadCount++;
      } catch (error) {
        console.error(`Error creating transcription package for ${item.name}:`, error);
      }
    }
    
    if (downloadCount > 0) {
      toast.success(`Downloaded ${downloadCount} transcription package${downloadCount > 1 ? 's' : ''}`);
    } else {
      toast.error("Failed to create transcription packages");
    }
  };
  
  // Process an individual item
  const handleReprocessItem = async (itemId: string) => {
    // Special cases for batch processing
    if (itemId === 'all' || itemId === 'new') {
      if (itemId === 'all') {
        handleStartBatchProcessingAll();
      } else {
        handleStartBatchProcessingNew();
      }
      return;
    }
    
    // Normal processing for a single item
    if (isProcessingBatch) {
      toast.error("Cannot process individual item while batch is running");
      return;
    }
    
    // Get item from queue
    const audioQueue = getAudioQueue();
    const item = audioQueue.find(i => i.id === itemId);
    
    if (!item) {
      toast.error(`Item with ID ${itemId} not found in queue`);
      return;
    }
    
    // Initialize progress tracking for this item
    setIndividualProgressMap(prev => ({
      ...prev,
      [itemId]: {
        isProcessing: true,
        progress: 0,
        isSplitting: false,
        splittingProgress: 0,
        currentPartIndex: null,
        totalParts: 0,
        fileName: item.name,
        fileSize: item.file?.size || 0,
        partElapsedTime: 0
      }
    }));
    
    try {
      // Use the model from BatchProcessor
      const model = batchProcessorRef.current?.selectedModel || selectedModel;
      
      // Process the item
      await processQueueItem(item, model);
      
      // Success notification
      toast.success(`Successfully processed ${item.name}`);
    } catch (error) {
      console.error(`Error processing item ${item.name}:`, error);
      toast.error(`Processing failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      // Clean up progress tracking
      setIndividualProgressMap(prev => {
        const newMap = { ...prev };
        delete newMap[itemId];
        return newMap;
      });
    }
  };
  
  // Process a single queue item
  const processQueueItem = async (item: QueuedAudioItem, model: string) => {
    // Set item status to processing
    console.log(`Starting to process queue item ${item.id} with model: ${model}`);
    updateItemStatus(item.id, 'processing');
    
    try {
      console.log(`Processing queue item ${item.id} with model: ${model}`);
      
      // Validate model name format
      if (!model.startsWith('whisper-') && !model.startsWith('groq-')) {
        throw new Error(`Invalid model format: "${model}". Model name must start with "whisper-" or "groq-"`);
      }
      
      // Process the item and wait for completion
      const result = await processAudioItem(item, model);
      
      // Improved validation for the result
      if (result && result.text) {
        // Ensure the status is updated in the queue
        console.log(`Transcription completed for ${item.name}, updating status to completed`, result);
        updateItemStatus(item.id, 'completed', result);
        
        // Check queue again to confirm update
        setTimeout(() => {
          const updatedItem = getAudioQueue().find(qi => qi.id === item.id);
          console.log('Verifying updated status:', {
            id: item.id,
            currentStatus: updatedItem?.transcriptionStatus,
            hasData: !!updatedItem?.transcriptionData
          });
          
          // If status not updated properly, try again
          if (updatedItem && updatedItem.transcriptionStatus !== 'completed') {
            console.warn(`Item ${item.id} status not properly updated, retrying...`);
            updateItemStatus(item.id, 'completed', result);
          }
        }, 500);
        
        return result;
      } else {
        console.warn(`Process returned invalid result:`, result);
        throw new Error(`Transcription completed but returned incomplete data. Check that the model "${model}" is valid.`);
      }
    } catch (error) {
      console.error(`Error processing ${item.name}:`, error);
      // Mark this item as failed
      updateItemStatus(item.id, 'failed', null, `Transcription failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error; // Re-throw to allow the caller to handle it
    }
  };
  
  // Add a helper function to check for stuck processing items
  const checkStuckProcessingItems = () => {
    const queue = getAudioQueue();
    let fixed = 0;
    
    queue.forEach(item => {
      // If an item shows as processing but has transcription data, fix it
      if (item.transcriptionStatus === 'processing' && item.transcriptionData) {
        console.warn(`Item ${item.id} (${item.name}) is stuck in processing state but has data. Fixing...`);
        updateItemStatus(item.id, 'completed', item.transcriptionData);
        fixed++;
      }
      
      // If an item has been processing for too long without updates, mark as failed
      if (item.transcriptionStatus === 'processing' && 
          individualProgressMap[item.id]?.isProcessing === false) {
        console.warn(`Item ${item.id} (${item.name}) appears stuck. Marking as failed.`);
        updateItemStatus(item.id, 'failed', null, 'Processing timed out - please try again');
        fixed++;
      }
    });
    
    if (fixed > 0) {
      console.log(`Fixed ${fixed} items with incorrect status`);
    }
  };
  
  // Run the check periodically
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (!isProcessingBatch) {
        checkStuckProcessingItems();
      }
    }, 5000); // Check every 5 seconds
    
    return () => clearInterval(intervalId);
  }, [isProcessingBatch, individualProgressMap]);
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Audio Transcription</CardTitle>
        <CardDescription>
          Transcribe audio files using local Whisper model or Groq API
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <Tabs defaultValue="batch" value={activeMode} onValueChange={(value) => setActiveMode(value as "single" | "batch")}>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="single">Single File</TabsTrigger>
            <TabsTrigger value="batch">Batch Mode</TabsTrigger>
          </TabsList>
          
          {/* Single file mode */}
          <TabsContent value="single">
            <AudioTranscription />
          </TabsContent>
          
          {/* Batch mode */}
          <TabsContent value="batch" className="space-y-6">
            {/* Pass ref to access queue */}
            <BatchProcessor
              ref={batchProcessorRef}
              onReprocessItem={handleReprocessItem}
              onStartBatchProcessingAll={handleStartBatchProcessingAll}
              onStartBatchProcessingNew={handleStartBatchProcessingNew}
              onStopBatchProcessing={handleStopBatchProcessing}
              onDownloadAllTranscriptions={handleDownloadAllTranscriptions}
              isProcessingBatch={isProcessingBatch}
              individualProgressMap={individualProgressMap}
            />
            
            {/* Display processing status and progress */}
            {isProcessingBatch && (
              <div className="space-y-2 mt-4 p-4 border rounded-md">
                <div className="flex flex-col space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>
                      Processing: {currentBatchItem !== null ? `${currentBatchItem + 1}/${getAudioQueue().length}` : 'Complete'}
                    </span>
                    <span>
                      Elapsed: {formatTime(batchElapsedTime)}
                    </span>
                  </div>
                  
                  {/* Display splitting progress when splitting files */}
                  {isSplittingFile && (
                    <div className="text-sm text-amber-600">
                      Splitting {currentFileName} into {totalParts} parts ({splittingProgress}%)
                      {splitTimeElapsed > 0 && ` - Time: ${formatTime(splitTimeElapsed)}`}
                    </div>
                  )}
                  
                  {/* Display part-by-part progress when processing split files */}
                  {currentPartIndex !== null && totalParts > 1 && (
                    <div className="text-sm text-blue-600">
                      Processing part {currentPartIndex + 1}/{totalParts} of {currentFileName} 
                      {currentFileSize > 0 && ` (size: ${formatFileSize(currentFileSize)})`}
                      {currentPartElapsedTime > 0 && ` - Time: ${formatTime(currentPartElapsedTime)}`}
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}