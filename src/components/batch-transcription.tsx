"use client";

import React, { useState, useRef, useEffect } from "react";
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
  
  // Function to get the current audio queue
  const getAudioQueue = () => {
    return batchProcessorRef.current?.audioQueue || [];
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
      
      console.log(`Updating item ${id} to status: ${status}`);
      
      // Create a new array with the updated item
      const updatedQueue = currentQueue.map(queueItem => {
        if (queueItem.id === id) {
          // Only update the specific item that matches the ID
          const transcriptionTime = status === 'completed' ? 
            (batchTimerRef.current?.getElapsedSeconds() || 0) : undefined;
          
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
      
      // Update the queue directly rather than through a state setter
      batchProcessorRef.current.updateQueue(updatedQueue);
      
      // Force a re-render by updating a state variable
      setForceUpdate(prev => prev + 1);
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

  // Handle start batch processing for all files
  const handleStartBatchProcessingAll = async () => {
    const audioQueue = getAudioQueue();
    
    if (audioQueue.length === 0) {
      toast.error("No audio files in queue to process");
      return;
    }
    
    if (isProcessingBatch) {
      toast.error("Batch processing already in progress");
      return;
    }
    
    // Reset batch state
    setIsProcessingBatch(true);
    setCurrentBatchItem(0);
    setBatchProgress(0);
    setBatchResults([]);
    
    // Reset part tracking state
    setCurrentPartIndex(null);
    setTotalParts(0);
    setCurrentFileName("");
    setCurrentFileSize(0);
    
    // Start timer
    if (batchTimerRef.current) {
      batchTimerRef.current.reset();
      batchTimerRef.current.start();
    }
    
    try {
      // Take a snapshot of the queue at the start of processing to avoid issues with queue changes
      const queueSnapshot = [...audioQueue];
      console.log(`Starting batch processing of ${queueSnapshot.length} files`);
      
      // Process each item in the queue sequentially
      for (let i = 0; i < queueSnapshot.length; i++) {
        const item = queueSnapshot[i];
        setCurrentBatchItem(i);
        
        // Update progress based on current item
        setBatchProgress(Math.round((i / queueSnapshot.length) * 100));
        
        // Process the current audio item
        toast.info(`Processing ${item.name} (${i + 1}/${queueSnapshot.length})`);
        
        try {
          // Ensure item status is set to processing before starting
          updateItemStatus(item.id, 'processing');
          
          // Process the item and wait for completion
          const result = await processAudioItem(item, selectedModel);
          
          // Explicitly set the status to completed after processing
          if (result) {
            updateItemStatus(item.id, 'completed', result);
            console.log(`Successfully transcribed ${item.name}`);
          }
        } catch (error) {
          console.error(`Error processing ${item.name}:`, error);
          // Mark this item as failed
          updateItemStatus(item.id, 'failed', null, `Transcription failed: ${error instanceof Error ? error.message : "Unknown error"}`);
          // Continue with next file instead of stopping the whole batch
          continue;
        }
        
        // Force a small delay between items to ensure state updates are processed
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Mark as complete
      setCurrentBatchItem(null);
      setBatchProgress(100);
      
      // Clear part tracking state
      setCurrentPartIndex(null);
      setTotalParts(0);
      setCurrentFileName("");
      setCurrentFileSize(0);
      
      toast.success(`Processed ${queueSnapshot.length} files`);
      
    } catch (error) {
      console.error("Error in batch processing:", error);
      toast.error(`Error processing batch: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      // Stop timer
      if (batchTimerRef.current) {
        batchTimerRef.current.stop();
      }
      setIsProcessingBatch(false);
    }
  };
  
  // Handle stop batch processing
  const handleStopBatchProcessing = () => {
    if (!isProcessingBatch) return;
    
    // Stop timer
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
  
  // Handle download all transcriptions
  const handleDownloadAll = () => {
    const queue = getAudioQueue();
    const completedItems = queue.filter(item => 
      item.transcriptionStatus === 'completed' && item.transcriptionData
    );
    
    if (completedItems.length === 0) {
      toast.error("No completed transcriptions to download");
      return;
    }
    
    // Show how many files are being included
    toast.info(`Creating download with ${completedItems.length} of ${queue.length} files`);
    
    // Create a ZIP file containing all transcriptions and audio files
    const zip = new JSZip();
    let filesProcessed = 0;
    let filesWithErrors = 0;
    
    // Add each file and its transcriptions to the ZIP
    completedItems.forEach((item, index) => {
      if (item.transcriptionData) {
        const data = item.transcriptionData;
        const baseFileName = item.name.replace(/\.[^/.]+$/, ''); // Remove extension
        
        try {
          // Add JSON transcription
          zip.file(
            `${index+1}_${baseFileName}_transcription.json`, 
            JSON.stringify(data, null, 2)
          );
          
          // Add compact text transcription - normalize newlines to match preview
          // Remove any excessive newlines (more than one in a row) and part markers
          const normalizedText = data.text
            .replace(/\n{2,}/g, '\n')  // Replace two or more newlines with a single one
            .replace(/\[Part \d+\]\n/g, '');  // Remove part markers
            
          zip.file(
            `${index+1}_${baseFileName}_compact.txt`, 
            normalizedText
          );
          
          // Add time-segmented transcription
          const timeSegments = data.segments.map((seg: TranscriptionSegment) => 
            `[${formatTime(seg.start)} → ${formatTime(seg.end)}] ${seg.text}`
          ).join('\n\n');
          zip.file(`${index+1}_${baseFileName}_timeseg.txt`, timeSegments);
          
          // Add the audio file if available
          if (item.file) {
            zip.file(`${index+1}_${item.name}`, item.file);
          }
          
          filesProcessed++;
        } catch (error) {
          console.error(`Error adding file ${item.name} to zip:`, error);
          filesWithErrors++;
        }
      }
    });
    
    // Generate and download the ZIP file
    zip.generateAsync({type: 'blob'})
      .then((content: Blob) => {
        const url = URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = url;
        link.download = `transcriptions_${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        let message = `Downloaded ${filesProcessed} transcriptions and audio files`;
        if (filesWithErrors > 0) {
          message += ` (${filesWithErrors} files had errors and were skipped)`;
        }
        toast.success(message);
      })
      .catch((err: Error) => {
        console.error("Error creating ZIP file:", err);
        toast.error("Failed to create download package");
      });
  };
  
  // Handle reprocessing a single item
  const handleReprocessItem = async (itemId: string) => {
    const queue = getAudioQueue();
    const item = queue.find(i => i.id === itemId);
    
    if (!item) {
      toast.error("Item not found in queue");
      return;
    }
    
    // Initialize individual progress tracking for this item
    setIndividualProgressMap(prev => ({
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
    
    toast.info(`Reprocessing ${item.name}...`);
    
    // Use current selected model
    try {
      // Ensure item status is set to processing before starting
      updateItemStatus(itemId, 'processing');
      
      // Process with individual item tracking
      const result = await processAudioItem(item, selectedModel, itemId);
      
      if (result) {
        // Update the item status to completed
        updateItemStatus(itemId, 'completed', result);
        toast.success(`Successfully reprocessed ${item.name}`);
      }
    } catch (error) {
      // Mark as failed
      updateItemStatus(itemId, 'failed', null, `Failed to reprocess: ${error instanceof Error ? error.message : "Unknown error"}`);
      toast.error(`Failed to reprocess ${item.name}: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      // Clean up individual progress tracking
      setIndividualProgressMap(prev => {
        const updated = {...prev};
        delete updated[itemId];
        return updated;
      });
    }
  };
  
  // Create a new function for processing only new items
  const handleStartBatchProcessingNew = async () => {
    const audioQueue = getAudioQueue();
    
    if (audioQueue.length === 0) {
      toast.error("No audio files in queue to process");
      return;
    }
    
    if (isProcessingBatch) {
      toast.error("Batch processing already in progress");
      return;
    }
    
    // Reset batch state
    setIsProcessingBatch(true);
    setCurrentBatchItem(0);
    setBatchProgress(0);
    
    // Don't reset batch results
    // setBatchResults([]);
    
    // Reset part tracking state
    setCurrentPartIndex(null);
    setTotalParts(0);
    setCurrentFileName("");
    setCurrentFileSize(0);
    
    // Start timer
    if (batchTimerRef.current) {
      batchTimerRef.current.reset();
      batchTimerRef.current.start();
    }
    
    try {
      // Filter the queue to only include unprocessed items
      const queueToProcess = audioQueue.filter(item => {
        return !item.transcriptionStatus || 
               item.transcriptionStatus === 'pending' || 
               item.transcriptionStatus === 'failed';
      });
      
      if (queueToProcess.length === 0) {
        toast.info("No new files to process");
        setIsProcessingBatch(false);
        return;
      }
      
      console.log(`Starting batch processing of ${queueToProcess.length} new files`);
      
      // Process each unprocessed item in the queue sequentially
      for (let i = 0; i < queueToProcess.length; i++) {
        const item = queueToProcess[i];
        setCurrentBatchItem(i);
        
        // Update progress based on current item
        setBatchProgress(Math.round((i / queueToProcess.length) * 100));
        
        // Process the current audio item
        toast.info(`Processing ${item.name} (${i + 1}/${queueToProcess.length})`);
        
        try {
          // Ensure item status is set to processing before starting
          updateItemStatus(item.id, 'processing');
          
          // Process the item and wait for completion
          const result = await processAudioItem(item, selectedModel, item.id);
          
          // Explicitly set the status to completed after processing
          if (result) {
            updateItemStatus(item.id, 'completed', result);
            console.log(`Successfully transcribed ${item.name}`);
          }
        } catch (error) {
          console.error(`Error processing ${item.name}:`, error);
          // Mark this item as failed
          updateItemStatus(item.id, 'failed', null, `Transcription failed: ${error instanceof Error ? error.message : "Unknown error"}`);
          // Continue with next file instead of stopping the whole batch
          continue;
        }
        
        // Force a small delay between items to ensure state updates are processed
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Mark as complete
      setCurrentBatchItem(null);
      setBatchProgress(100);
      
      // Clear part tracking state
      setCurrentPartIndex(null);
      setTotalParts(0);
      setCurrentFileName("");
      setCurrentFileSize(0);
      
      toast.success(`Processed ${queueToProcess.length} files`);
      
    } catch (error) {
      console.error("Error in batch processing:", error);
      toast.error(`Error processing batch: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      // Stop timer
      if (batchTimerRef.current) {
        batchTimerRef.current.stop();
      }
      setIsProcessingBatch(false);
    }
  };
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Audio Transcription</CardTitle>
        <CardDescription>
          Transcribe audio files using local Whisper model or Groq API
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <Tabs value={activeMode} onValueChange={(value) => setActiveMode(value as "single" | "batch")}>
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
              individualProgressMap={individualProgressMap}
            />
            
            {/* Batch processing controls */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Batch Processing Controls</h3>
                <div className="space-x-2">
                  {isProcessingBatch ? (
                    <Button 
                      variant="destructive" 
                      onClick={handleStopBatchProcessing}
                    >
                      <StopCircle className="mr-2 h-4 w-4" />
                      Stop Processing
                    </Button>
                  ) : (
                    <div className="flex space-x-2">
                      <Button 
                        onClick={handleStartBatchProcessingAll}
                        disabled={queueLength === 0}
                      >
                        <Play className="mr-2 h-4 w-4" />
                        Process All
                      </Button>
                      <Button 
                        variant="secondary"
                        onClick={handleStartBatchProcessingNew}
                        disabled={queueLength === 0 || !hasUnprocessedItems()}
                      >
                        <Play className="mr-2 h-4 w-4" />
                        Process New
                      </Button>
                    </div>
                  )}
                  
                  <Button 
                    variant="outline" 
                    onClick={handleDownloadAll}
                    disabled={!getAudioQueue().some(item => 
                      item.transcriptionStatus === 'completed'
                    )}
                  >
                    <FileDown className="mr-2 h-4 w-4" />
                    Download All
                    {getCompletedItemsCount() > 0 && (
                      <span className="ml-1 text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">
                        {getCompletedItemsCount()}
                      </span>
                    )}
                  </Button>
                </div>
              </div>
              
              {/* Move transcription model selection below the controls */}
              <div className="mt-4">
                <Label htmlFor="batch-model-select">Transcription Model</Label>
                <Select
                  value={selectedModel}
                  onValueChange={(value) => setSelectedModel(value)}
                  disabled={isProcessingBatch}
                >
                  <SelectTrigger id="batch-model-select">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Local Models (run on your machine)</SelectLabel>
                      <SelectItem value="whisper-tiny">Whisper Tiny (Fast)</SelectItem>
                      <SelectItem value="whisper-base">Whisper Base</SelectItem>
                      <SelectItem value="whisper-small">Whisper Small</SelectItem>
                      <SelectItem value="whisper-medium">Whisper Medium</SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Groq API Models (requires API key)</SelectLabel>
                      <SelectItem value="groq-distil-whisper">Distil Whisper - English Only (faster)</SelectItem>
                      <SelectItem value="groq-whisper-large-v3-turbo">Whisper Large v3 Turbo - Multilingual (faster)</SelectItem>
                      <SelectItem value="groq-whisper-large-v3">Whisper Large v3 - Multilingual (higher quality)</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Batch progress */}
              {isProcessingBatch && (
                <div className="space-y-2">
                  <div className="flex flex-col space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>
                        Processing: {currentBatchItem !== null ? `${currentBatchItem + 1}/${getAudioQueue().length}` : 'Complete'}
                      </span>
                      <span>
                        Elapsed: {Math.floor(batchElapsedTime / 60)}m {batchElapsedTime % 60}s
                      </span>
                    </div>
                    
                    {/* Display splitting progress when splitting files */}
                    {isSplittingFile && (
                      <div className="text-sm text-amber-600">
                        Splitting {currentFileName} into {totalParts} parts ({splittingProgress}%)
                        {splitTimeElapsed > 0 && ` - Time: ${Math.floor(splitTimeElapsed / 60)}m ${splitTimeElapsed % 60}s`}
                      </div>
                    )}
                    
                    {/* Display part-by-part progress when processing split files */}
                    {currentPartIndex !== null && totalParts > 1 && (
                      <div className="text-sm text-blue-600">
                        Processing part {currentPartIndex + 1}/{totalParts} of {currentFileName} 
                        {currentFileSize > 0 && ` (size: ${formatFileSize(currentFileSize)})`}
                        {currentPartElapsedTime > 0 && ` - Time: ${Math.floor(currentPartElapsedTime / 60)}m ${currentPartElapsedTime % 60}s`}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}