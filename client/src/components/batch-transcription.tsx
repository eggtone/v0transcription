"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Play, StopCircle, Download, FileDown, Loader2, Archive, FileText, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import AudioQueueManager from "@/components/audio-queue-manager";
import { formatTime, formatCompletionTime, ProcessTimer } from "@/lib/time-utils";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DetailedTranscription, TranscriptionSegment, QueuedAudioItem } from "@shared/types";
import { AudioPart, MP3Quality, splitAudioFile, formatFileSize, getAudioDuration } from "@/lib/audio-utils";
import { processSplitAudioParts, SplitAudioState } from "@/lib/audio-split-utils";
import JSZip from "jszip";
import { useBatchQueueStore, EnhancedQueuedAudioItem } from "@/stores/batchQueueStore";
import path from "path";
import { triggerBrowserDownload, generateMetadataCsv } from "@/lib/download-utils";

export default function BatchTranscription() {
  const {
    audioQueue,
    selectedModel,
    isProcessingBatch,
    currentProcessingId,
    setSelectedModel,
    setProcessingStatus,
    updateItem,
    getQueue,
    getItemById
  } = useBatchQueueStore();

  const [currentBatchItemIndex, setCurrentBatchItemIndex] = useState<number | null>(null);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchElapsedTime, setBatchElapsedTime] = useState(0);
  const batchTimerRef = useRef<ProcessTimer | null>(null);
  const stopProcessingRef = useRef<boolean>(false);

  const [currentPartIndex, setCurrentPartIndex] = useState<number | null>(null);
  const [totalParts, setTotalParts] = useState<number>(0);
  const [currentFileName, setCurrentFileName] = useState<string>("");
  const [currentFileSize, setCurrentFileSize] = useState<number>(0);
  const [isSplittingFile, setIsSplittingFile] = useState(false);
  const [splittingProgress, setSplittingProgress] = useState(0);
  const [splitTimeElapsed, setSplitTimeElapsed] = useState(0);
  const [currentPartStartTime, setCurrentPartStartTime] = useState(0);
  const [currentPartElapsedTime, setCurrentPartElapsedTime] = useState(0);
  
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
  
  const { pendingCount, processableCount } = useMemo(() => {
    const queue = getQueue();
    let pending = 0;
    let processable = 0;

    queue.forEach(item => {
      const isReady = item.file && 
                      item.extractionStatus !== 'extracting' && 
                      item.extractionStatus !== 'downloading' && 
                      item.transcriptionStatus !== 'processing' &&
                      item.transcriptionStatus !== 'completed';

      if (isReady) {
        if (item.transcriptionStatus === 'pending') {
          pending++;
          processable++;
        } else if (item.transcriptionStatus === 'failed') {
          processable++;
        }
      }
    });

    return { pendingCount: pending, processableCount: processable };
  }, [audioQueue, getQueue]);
  
  useEffect(() => {
    batchTimerRef.current = new ProcessTimer((seconds) => {
      setBatchElapsedTime(seconds);
    });
    return () => { batchTimerRef.current?.cleanup(); };
  }, []);
  
  function determineSplitParams(fileSize: number): { needsSplit: boolean, numParts: number } {
    const MAX_PART_SIZE = 10 * 1024 * 1024; // 10MB - Original Value
    if (fileSize <= MAX_PART_SIZE) {
      return { needsSplit: false, numParts: 1 };
    }
    const numParts = Math.ceil(fileSize / MAX_PART_SIZE);
    return { needsSplit: true, numParts };
  }
  
  const processAudioItem = async (
    item: EnhancedQueuedAudioItem, 
    model: string,
    isIndividualReprocess: boolean = false
  ): Promise<DetailedTranscription | null> => {
    console.log(`Processing audio item: ${item.name}`);
    let audioParts: AudioPart[] = [];
    const itemId = item.id;
    let currentItem = { ...item }; // Work with a mutable copy for preparation steps

    if (isIndividualReprocess) {
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
    }

    // --- PREPARATION STEP ---
    if (currentItem.extractionStatus === 'pending') {
      if (currentItem.source === 'local' && currentItem.file) {
        try {
          toast.info(`Preparing local file: ${currentItem.name}...`);
          let blobUrl = URL.createObjectURL(currentItem.file);
          // Try to get duration if not already set
          const duration = currentItem.duration || await getAudioDuration(blobUrl);
          URL.revokeObjectURL(blobUrl); // Revoke immediately after getting duration
          updateItem(itemId, { duration: duration, extractionStatus: 'completed' });
          currentItem = { ...currentItem, duration: duration, extractionStatus: 'completed' }; // Update local copy
          toast.success(`Prepared local file: ${currentItem.name}`);
        } catch (err) {
          console.error(`Error getting duration for ${currentItem.name}:`, err);
          currentItem = { ...currentItem, extractionStatus: 'failed', extractionError: 'Failed to get duration' };
          toast.error(`Failed to prepare local file ${currentItem.name}: ${err instanceof Error ? err.message : 'Could not read duration'}`);
        }
      } else if ((currentItem.source === 'youtube-video' || currentItem.source === 'youtube-playlist') && currentItem.url) {
        // YouTube extraction logic should have already run and updated status/file
        // If it's still pending here, something went wrong earlier or it was added manually without extraction?
        // For now, we assume extraction happened via BatchProcessor
        // If file is missing, transcription will fail later
         if (!currentItem.file) {
           console.warn(`YouTube item ${currentItem.name} is pending but has no file. Transcription will likely fail.`);
           // Optionally mark as failed extraction here if needed
           // updateItem(itemId, { extractionStatus: 'failed', extractionError: 'Missing extracted file' });
           // throw new Error('Missing extracted file for YouTube item');
         }
      } else {
         updateItem(itemId, { extractionStatus: 'failed', extractionError: 'Invalid state for pending item' });
         throw new Error('Invalid pending item state');
      }
    }

    // If extraction failed previously or during prep, stop
    if (currentItem.extractionStatus === 'failed') {
       console.warn(`Skipping processing for failed/unprepared item: ${currentItem.name} (Status: ${currentItem.extractionStatus}, Error: ${currentItem.extractionError})`);
       if (isIndividualReprocess) {
           setIndividualProgressMap(prev => ({ ...prev, [itemId]: { ...prev[itemId], isProcessing: false } }));
       }
       return null; // Don't proceed
    }

    // --- SPLITTING STEP (if needed) ---
    let needsSplit = false;
    if (currentItem.file) { // Check if file exists before accessing size or splitting
      const { needsSplit: shouldSplit, numParts } = determineSplitParams(currentItem.file.size);
      needsSplit = shouldSplit;
      
      if (shouldSplit) {
        // Update individual progress to show splitting is starting
        if (isIndividualReprocess || isProcessingBatch) { // Update map if part of any process
            setIndividualProgressMap(prev => ({ 
                ...prev, 
                [itemId]: { 
                    ...(prev[itemId] || {}),
                    isProcessing: true, // Ensure it's marked as processing
                    isSplitting: true, 
                    splittingProgress: 0,
                    totalParts: numParts, // We know the target number of parts
                    fileName: currentItem.name,
                    fileSize: currentItem.file?.size || 0,
                } 
            }));
        }
        
        setTotalParts(numParts); // Still useful for overall display?

        toast.info(`Splitting ${item.name} into ${numParts} parts...`);
        try {
          const splitStartTime = Date.now(); // Timer for splitting duration
          const onSplitProgress = (progress: number) => {
            // Update splitting progress in the map
            if (isIndividualReprocess || isProcessingBatch) {
                const elapsedSplitTime = Math.floor((Date.now() - splitStartTime) / 1000);
                setIndividualProgressMap(prev => ({
                    ...prev, 
                    [itemId]: { 
                        ...(prev[itemId]), 
                        splittingProgress: progress, 
                        partElapsedTime: elapsedSplitTime // Use partElapsedTime to show splitting time
                    }
                }));
            }
          };
          
          audioParts = await splitAudioFile(currentItem.file, numParts, MP3Quality.HIGH, onSplitProgress);
          setIsSplittingFile(false);
          toast.success(`Split ${item.name} into ${numParts} parts.`);
          
        } catch (splitError) {
          const errorMsg = splitError instanceof Error ? splitError.message : 'Unknown split error';
          console.error(`Error splitting file ${currentItem.name}:`, splitError);
          if (isIndividualReprocess || isProcessingBatch) {
              setIndividualProgressMap(prev => ({ 
                  ...prev, 
                  [itemId]: { ...prev[itemId], isProcessing: false, isSplitting: false } 
              }));
          }
          // Mark item as failed in store and stop processing
          updateItem(itemId, { 
              transcriptionStatus: 'failed', 
              transcriptionError: `Failed to split audio: ${errorMsg}` 
          });
          toast.error(`Failed to split audio for ${currentItem.name}`);
          return null; 
        }
      }
    }

    let finalTranscription: DetailedTranscription | null = null;
    const partTimer = new ProcessTimer((secs) => {
        if (isIndividualReprocess) {
           // Update partElapsedTime within the individual progress map
           setIndividualProgressMap(prev => {
             const current = prev[itemId];
             if (current) {
               return { ...prev, [itemId]: { ...current, partElapsedTime: secs } };
             }
             return prev; // Should not happen if isIndividualReprocess is true
           });
         } else {
           // Update component-level state if needed for overall batch progress display
            setCurrentPartElapsedTime(secs);
         }
    });

    try {
      // --- TRANSCRIPTION STEP --- 
      if (needsSplit && audioParts.length > 0) {
        // Prepare resume state if available
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
          itemId: item.id, // Pass item ID
          updateItemInStore: updateItem, // Pass store update function
          setCurrentPartIndex: (index: number) => {
             console.log(`setCurrentPartIndex called with: ${index}`);
             setCurrentPartIndex(index); 
             setTotalParts(audioParts.length);
             
             // Update individual progress map for the new part
             if (isIndividualReprocess || isProcessingBatch) {
                 setIndividualProgressMap(prev => ({
                     ...prev,
                     [itemId]: { 
                         ...(prev[itemId]), 
                         currentPartIndex: index,
                         totalParts: audioParts.length,
                         isSplitting: false, // Splitting done
                         progress: 0 // Reset progress for the new part
                     }
                 }));
             }
             partTimer.reset(); 
             partTimer.start();
          },
          setTranscriptionProgress: (progress: number) => {
             console.log(`setTranscriptionProgress called with: ${progress}`);
             if (isIndividualReprocess || isProcessingBatch) {
                 setIndividualProgressMap(prev => ({
                     ...prev,
                     [itemId]: { 
                         ...(prev[itemId]), 
                         progress: progress 
                     }
                 }));
             }
          },
          setIsTranscribingParts: (isTranscribing: boolean) => { /* Manage component state if needed */ },
          setIsTranscribing: (isTranscribing: boolean) => { /* Manage component state if needed */ },
          setError: (error: string | null) => { 
             // Error is now handled after the call returns/throws
          },
          setElapsedTime: (elapsedSeconds: number) => { /* Could update a local timer state */ },
          setProcessingTime: (processingTime: string | null) => { /* Update UI if needed */ },
          setTranscriptionData: (data: DetailedTranscription | null) => { 
             // Util updates progressively, not needed here
          },
          setFormattedTranscriptionText: (text: string) => { /* Not needed here */ },
          getElapsedTime: () => batchTimerRef.current?.getElapsedSeconds() || 0,
        };

        partTimer.start();
        finalTranscription = await processSplitAudioParts(
          audioParts, 
          model, 
          splitAudioState,
          resumeState // Pass the resume state
        );
        partTimer.stop();
        
        // If successful, clear the resume state from the store item
        if (finalTranscription) {
          updateItem(item.id, { 
            lastCompletedPartIndex: null, 
            partResults: [] 
          });
          toast.success(`Transcription assembled for ${item.name}.`);
        }
      } else if (currentItem.file) { // Single file or non-split case
        partTimer.start();
        if (isIndividualReprocess || isProcessingBatch) {
           setIndividualProgressMap(prev => ({ 
               ...prev, 
               [itemId]: { 
                   ...(prev[itemId]), 
                   isProcessing: true, 
                   isSplitting: false, 
                   progress: 5, // Indicate start
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
        if (isIndividualReprocess || isProcessingBatch) {
           setIndividualProgressMap(prev => ({ 
               ...prev, 
               [itemId]: { ...prev[itemId], progress: 100 } 
           }));
        }
        partTimer.stop();
        // Clear potential partial results if somehow present from a previous failed split attempt
        updateItem(item.id, { 
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
       if (isIndividualReprocess) {
          setIndividualProgressMap(prev => ({ ...prev, [itemId]: { ...prev[itemId], isProcessing: false } }));
       }
       // NOTE: Do NOT clear partial results on error here
       // Let the next retry attempt use them
       
       // Re-throw the formatted error message
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

    if (isIndividualReprocess) {
       // Final state update for individual reprocess - ensure isProcessing is false
       setIndividualProgressMap(prev => ({ 
           ...prev, 
           [itemId]: { 
               ...(prev[itemId]), 
               isProcessing: false, 
               // Keep progress at 100 if successful, otherwise it was already set by error handling
               progress: finalTranscription ? 100 : (prev[itemId]?.progress || 0)
           } 
       }));
    }
    
    return finalTranscription;
  };

  const processAudioItemWrapper = async (item: EnhancedQueuedAudioItem, model: string) => {
    const startTime = Date.now();
    setProcessingStatus(true, item.id);
    // Don't clear partial results when starting processing, only on success/reset
    updateItem(item.id, { transcriptionStatus: 'processing', transcriptionError: undefined });
    
    try {
      const result = await processAudioItem(item, model, false);
      const endTime = Date.now();
      const processingTime = (endTime - startTime) / 1000;
      
      if (result && result.text) {
         updateItem(item.id, { 
           transcriptionStatus: 'completed', 
           transcriptionData: result, 
           transcriptionTime: processingTime,
           lastCompletedPartIndex: null, // Clear partial results on success
           partResults: []             // Clear partial results on success
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
             // Log but don't fail the overall process
             console.warn(`Failed to clean up temporary file: ${cleanupError}`);
           }
         }
      } else if (result && !result.text) {
         // Mark as failed, but keep partial results for potential retry
         updateItem(item.id, {
            transcriptionStatus: 'failed',
            transcriptionError: "Transcription completed but empty text was returned. The audio may be silent or format not recognized.",
         });
         throw new Error("Transcription completed but empty text was returned. The audio may be silent or format not recognized.");
      } else {
         // Mark as failed, but keep partial results for potential retry
         updateItem(item.id, {
            transcriptionStatus: 'failed',
            transcriptionError: "Transcription process returned null result. This may be due to a network error or timeout.",
         });
         throw new Error("Transcription process returned null result. This may be due to a network error or timeout.");
      }
    } catch (error) {
      console.error(`Error processing wrapper for ${item.id}:`, error);
      // Error already set in processAudioItem or here, keep partial results
      // Update status to failed if not already set by inner function's error
      const currentItemState = getItemById(item.id);
      if (currentItemState && currentItemState.transcriptionStatus !== 'failed') {
         const errorMessage = error instanceof Error ? error.message : "Unknown processing error";
         updateItem(item.id, { 
           transcriptionStatus: 'failed', 
           transcriptionError: errorMessage 
         });
      }
    } finally {
       // Ensure processing status is cleared for this specific item if batch isn't running
       // The overall batch status is handled in handleStartProcessing
       if (!isProcessingBatch) {
          setProcessingStatus(false, null);
       }
    }
  };

  const handleReprocessItem = async (itemId: string) => {
    const item = getItemById(itemId);
    if (!item) {
      toast.error("Item not found for reprocessing.");
      return;
    }
    if (!item.file && !item.url) {
      toast.error(`Cannot reprocess "${item.name}": Missing audio source.`);
      return;
    }
     if (individualProgressMap[itemId]?.isProcessing || isProcessingBatch) {
      toast.warning(`Cannot reprocess "${item.name}" while another process is active.`);
      return;
    }

    toast.info(`Reprocessing individual item: ${item.name}`);
    const modelToUse = selectedModel;
    const startTime = Date.now();

    setIndividualProgressMap(prev => ({
      ...prev,
      [item.id]: {
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
    updateItem(item.id, { transcriptionStatus: 'processing', transcriptionError: undefined, transcriptionTime: undefined, transcriptionData: null });

    try {
      const result = await processAudioItem(item, modelToUse, true);
      const endTime = Date.now();
      const processingTime = (endTime - startTime) / 1000;

      if (result) {
        updateItem(item.id, {
          transcriptionStatus: 'completed',
          transcriptionData: result,
          transcriptionTime: processingTime,
          lastCompletedPartIndex: null, // Clear partial results on success
          partResults: []             // Clear partial results on success
        });
        toast.success(`Reprocessing complete for ${item.name}.`);
        
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
            // Log but don't fail the overall process
            console.warn(`Failed to clean up temporary file: ${cleanupError}`);
          }
        }
      } else {
         // If processAudioItem returns null but didn't throw, mark as failed
         // Keep partial results for potential next retry
         updateItem(item.id, {
             transcriptionStatus: 'failed',
             transcriptionError: "Individual reprocessing returned null result."
         });
         throw new Error("Individual reprocessing returned null result.");
      }
    } catch (error) {
      console.error(`Error reprocessing item ${item.id}:`, error);
      // Error should already be set by processAudioItem
      // If not, set it here. Keep partial results.
      const currentItemState = getItemById(item.id);
      if (currentItemState && currentItemState.transcriptionStatus !== 'failed') {
         const errorMessage = error instanceof Error ? error.message : "Unknown reprocessing error";
         updateItem(item.id, {
           transcriptionStatus: 'failed',
           transcriptionError: errorMessage
         });
      }
      toast.error(`Reprocessing failed for ${item.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
       setIndividualProgressMap(prev => {
         const newState = { ...prev };
         if (newState[item.id]) {
           newState[item.id] = { ...newState[item.id], isProcessing: false };
         }
         return newState;
       });
    }
  };

  const handleStartProcessing = async (processOnlyPending: boolean) => {
    const itemsToProcess = getQueue().filter(item => {
      // Basic readiness checks: Must have audio and not be extracting/downloading/processing
      if (!item.file || 
          item.extractionStatus === 'extracting' || 
          item.extractionStatus === 'downloading' || 
          item.transcriptionStatus === 'processing') {
        return false;
      }

      // Exclude completed items from all batch operations
      if (item.transcriptionStatus === 'completed') {
        return false;
      }

      // Filter based on button clicked
      if (processOnlyPending) {
        // Process Pending: Only 'pending' status
        return item.transcriptionStatus === 'pending';
      } else {
        // Process All: 'pending' OR 'failed' status
        return item.transcriptionStatus === 'pending' || item.transcriptionStatus === 'failed';
      }
    });

    if (itemsToProcess.length === 0) {
      toast.info(processOnlyPending 
        ? "No items currently pending transcription."
        : "No items ready for processing or reprocessing.");
      return;
    }

    toast.info(`Starting batch processing for ${itemsToProcess.length} item(s)...`);
    stopProcessingRef.current = false;
    setProcessingStatus(true);
    batchTimerRef.current?.reset();
    batchTimerRef.current?.start();
    setBatchProgress(0);

    for (let i = 0; i < itemsToProcess.length; i++) {
      if (stopProcessingRef.current) {
        toast.warning("Batch processing stopped by user.");
        break;
      }
      
      const item = itemsToProcess[i];
      setCurrentBatchItemIndex(i);
      
      // Skip if not in the correct state (redundant check, but safe)
      if (processOnlyPending && item.transcriptionStatus !== 'pending') continue;
      if (!processOnlyPending && !(item.transcriptionStatus === 'pending' || item.transcriptionStatus === 'failed')) continue;
      
      await processAudioItemWrapper(item, selectedModel);
      
      const progress = ((i + 1) / itemsToProcess.length) * 100;
      setBatchProgress(progress);
    }

    batchTimerRef.current?.stop();
    setProcessingStatus(false);
    setCurrentBatchItemIndex(null);
    if (!stopProcessingRef.current) {
       toast.success("Batch processing complete.");
    }
  };

  const handleStartBatchProcessingAll = () => handleStartProcessing(false);
  const handleStartBatchProcessingNew = () => handleStartProcessing(true);

  const handleStopBatchProcessing = () => {
    stopProcessingRef.current = true;
  };

  // Add stopBatchProcessing function
  const stopBatchProcessing = () => {
    stopProcessingRef.current = true;
    toast.warning("Processing stopped by queue clear.");
    // Ensure the overall batch status is set to false
    setProcessingStatus(false);
  };

  const handleDownloadAllTranscriptions = async () => {
    const itemsToDownload = audioQueue.filter(item => item.transcriptionStatus === 'completed' && item.transcriptionData);
    
    if (itemsToDownload.length === 0) {
      toast.warning("No completed transcriptions available to download.");
      return;
    }

    toast.info(`Preparing package for ${itemsToDownload.length} completed item(s)...`);
    const zip = new JSZip();
    let filesAdded = 0;
    let audioFilesAdded = 0;

    // Try to fetch blob URLs for batch-processed items
    let blobUrlMap: Record<string, string> = {};
    try {
      // Check if we have a current batch job ID (this would need to be tracked)
      // For now, we'll try to fetch blob URLs for items that might be from batch processing
      const batchProcessedItems = itemsToDownload.filter(item => !item.file && !item.url);
      if (batchProcessedItems.length > 0) {
        console.log(`Attempting to fetch blob URLs for ${batchProcessedItems.length} batch-processed items`);
        // Note: We would need the batch job ID to fetch URLs
        // For now, this will be skipped until we implement batch job ID tracking
      }
    } catch (error) {
      console.warn('Could not fetch blob URLs for batch items:', error);
    }

    // ++ Generate metadata for completed items ++
    try {
        const metadataCsvString = generateMetadataCsv(itemsToDownload);
        zip.file("metadata.csv", metadataCsvString);
        console.log("Added metadata.csv to the download package.");
    } catch (error) {
        console.error("Error generating or adding metadata.csv to zip:", error);
        toast.error("Failed to generate or add metadata file to the package.");
        // Optionally decide if you want to stop the whole download if metadata fails
        // return; 
    }
    // ++ End Metadata Generation ++

    for (const item of itemsToDownload) {
      try {
        const baseFileName = item.name.replace(/\.[^/.]+$/, '');
        const prefix = `${String(item.order ?? 0).padStart(3, '0')}_`;
        const data = item.transcriptionData!;

        zip.file(`${prefix}${baseFileName}_transcript.txt`, data.text || '');
        zip.file(`${prefix}${baseFileName}_transcript.json`, JSON.stringify(data, null, 2));
        if (data.segments && data.segments.length > 0) {
          const timeSegments = data.segments.map(seg => `[${formatTime(seg.start)} --> ${formatTime(seg.end)}] ${seg.text}`).join('\n\n');
          zip.file(`${prefix}${baseFileName}_timeseg.txt`, timeSegments);
        }
        
        if (item.file) {
          // Priority 1: Use local file object if available (on-demand processing or preserved from batch processing)
          console.log(`Using local file for ${item.name}: ${item.file.name} (${item.file.size} bytes)`);
          zip.file(`${prefix}${baseFileName}${path.extname(item.file.name) || '.mp3'}`, item.file);
          audioFilesAdded++;
        } else if (item.url) {
          // Priority 2: Download from URL if available (YouTube items with temp server URLs)
          try {
            console.log(`Priority 2: Downloading audio from YouTube temp URL for ${item.name}: ${item.url}`);
            const audioResponse = await fetch(item.url);
            if (audioResponse.ok) {
              const audioBlob = await audioResponse.blob();
              const fileExtension = path.extname(item.name) || '.mp3';
              zip.file(`${prefix}${baseFileName}${fileExtension}`, audioBlob);
              audioFilesAdded++;
              console.log(`Successfully added audio from temp URL for ${item.name}`);
            } else {
              console.warn(`Failed to download audio from temp URL for ${item.name}: ${audioResponse.status}`);
              toast.warning(`Could not download audio for ${item.name} (${audioResponse.status})`);
            }
          } catch (error) {
            console.warn(`Error downloading audio from temp URL for ${item.name}:`, error);
            toast.warning(`Could not download audio for ${item.name}`);
          }
        } else if (item.metadata?.blobUrl) {
          // Priority 3: Try to download from blob URL stored in metadata (backup for batch processing)
          try {
            console.log(`Priority 3: Downloading audio from stored blob URL for ${item.name}: ${item.metadata.blobUrl}`);
            const audioResponse = await fetch(item.metadata.blobUrl);
            if (audioResponse.ok) {
              const audioBlob = await audioResponse.blob();
              const fileExtension = path.extname(item.name) || '.mp3';
              zip.file(`${prefix}${baseFileName}${fileExtension}`, audioBlob);
              audioFilesAdded++;
              console.log(`Successfully added audio from stored blob URL for ${item.name}`);
            } else {
              console.warn(`Failed to download audio from stored blob URL for ${item.name}: ${audioResponse.status}`);
              toast.warning(`Could not download audio for ${item.name} (${audioResponse.status})`);
            }
          } catch (error) {
            console.warn(`Error downloading audio from stored blob URL for ${item.name}:`, error);
            toast.warning(`Could not download audio for ${item.name}`);
          }
        } else if (blobUrlMap[item.name]) {
          // Priority 4: Try to download from blob URL map (fetched from batch job API)
          try {
            const blobUrl = blobUrlMap[item.name];
            console.log(`Priority 4: Downloading audio from batch job blob URL for ${item.name}: ${blobUrl}`);
            const audioResponse = await fetch(blobUrl);
            if (audioResponse.ok) {
              const audioBlob = await audioResponse.blob();
              const fileExtension = path.extname(item.name) || '.mp3';
              zip.file(`${prefix}${baseFileName}${fileExtension}`, audioBlob);
              audioFilesAdded++;
              console.log(`Successfully added audio from batch job blob URL for ${item.name}`);
            } else {
              console.warn(`Failed to download audio from batch job blob URL for ${item.name}: ${audioResponse.status}`);
              toast.warning(`Could not download audio for ${item.name} (${audioResponse.status})`);
            }
          } catch (error) {
            console.warn(`Error downloading audio from batch job blob URL for ${item.name}:`, error);
            toast.warning(`Could not download audio for ${item.name}`);
          }
        } else {
          console.warn(`No audio source available for completed item: ${item.name}`);
          console.log(`Checked all priorities for ${item.name}:`, { 
            priority1_localFile: !!item.file, 
            priority2_tempUrl: !!item.url,
            priority3_storedBlobUrl: !!item.metadata?.blobUrl,
            priority4_apiBlobUrl: !!blobUrlMap[item.name],
            source: item.source,
            extractionStatus: item.extractionStatus,
            metadata: item.metadata 
          });
          // Don't add to audio count, but still increment files added for transcription files
        }
        filesAdded++;
      } catch (error) {
         console.error(`Error adding ${item.name} to zip:`, error);
         toast.error(`Failed to add ${item.name} to package.`);
      }
    }
    
    if (filesAdded > 0 || zip.files['metadata.csv']) { // Check if metadata was added even if no items were
       toast.promise(
         zip.generateAsync({ type: 'blob' }).then(content => {
           // Use triggerBrowserDownload helper with proper MIME type
           triggerBrowserDownload(
             content, 
             `transcriptions_${new Date().toISOString().slice(0, 10)}.zip`, 
             'application/zip'
           );
         }),
         {
           loading: 'Creating zip file...',
           // Update success message
           success: `Downloaded package with ${filesAdded} transcription(s)${audioFilesAdded > 0 ? ` and ${audioFilesAdded} audio file(s)` : ''} and metadata.csv.`,
           error: 'Failed to create zip file.',
         }
       );
    } else {
       toast.error("Failed to add any completed items or metadata to the package.");
    }
  };

  // ++ NEW: Handler for downloading only transcription files ++
  const handleDownloadOnlyTranscriptions = async () => {
    const itemsToDownload = audioQueue.filter(item => item.transcriptionStatus === 'completed' && item.transcriptionData);

    if (itemsToDownload.length === 0) {
      toast.warning("No completed transcriptions available to download.");
      return;
    }

    toast.info(`Preparing transcription package for ${itemsToDownload.length} item(s)...`);
    const zip = new JSZip();
    let filesAdded = 0;

    for (const item of itemsToDownload) {
      try {
        const baseFileName = item.name.replace(/\.[^/.]+$/, '');
        const prefix = `${String(item.order ?? 0).padStart(3, '0')}_`;
        const data = item.transcriptionData!;

        zip.file(`${prefix}${baseFileName}_transcript.txt`, data.text || '');
        zip.file(`${prefix}${baseFileName}_transcript.json`, JSON.stringify(data, null, 2));
        if (data.segments && data.segments.length > 0) {
          const timeSegments = data.segments.map(seg => `[${formatTime(seg.start)} --> ${formatTime(seg.end)}] ${seg.text}`).join('\n\n');
          zip.file(`${prefix}${baseFileName}_timeseg.txt`, timeSegments);
        }
        filesAdded++;
      } catch (error) {
         console.error(`Error adding ${item.name} transcription to zip:`, error);
         toast.error(`Failed to add ${item.name} transcription to package.`);
      }
    }

    if (filesAdded > 0) {
       toast.promise(
         zip.generateAsync({ type: 'blob' }).then(content => {
           triggerBrowserDownload(
             content,
             `transcriptions_only_${new Date().toISOString().slice(0, 10)}.zip`,
             'application/zip'
           );
         }),
         {
           loading: 'Creating zip file...',
           success: `Downloaded package with ${filesAdded} transcription(s).`,
           error: 'Failed to create zip file.',
         }
       );
    } else {
       toast.error("Failed to add any transcriptions to the package.");
    }
  };

  // ++ NEW: Handler for downloading only metadata file ++
  const handleDownloadMetadata = () => {
    if (audioQueue.length === 0) {
      toast.warning("Queue is empty. No metadata to download.");
      return;
    }

    toast.info(`Generating metadata for ${audioQueue.length} item(s)...`);
    try {
      const metadataCsvString = generateMetadataCsv(audioQueue);
      
      // Use text/csv;charset=utf-8 to ensure proper handling of newlines
      triggerBrowserDownload(
        metadataCsvString, 
        "metadata.csv", 
        "text/csv;charset=utf-8"
      );
      
      toast.success(`Metadata downloaded for ${audioQueue.length} item(s).`);
    } catch (error) {
      console.error("Error generating or downloading metadata CSV:", error);
      toast.error(`Failed to generate metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Add a function to download only audio files
  const handleDownloadAudioOnly = async () => {
    const itemsWithAudio = audioQueue.filter(item => item.file);
    
    if (itemsWithAudio.length === 0) {
      toast.warning("No audio files available to download.");
      return;
    }

    toast.info(`Preparing audio package for ${itemsWithAudio.length} item(s)...`);
    const zip = new JSZip();
    let filesAdded = 0;

    for (const item of itemsWithAudio) {
      try {
        if (item.file) {
          const baseFileName = item.name.replace(/\.[^/.]+$/, '');
          const prefix = `${String(item.order ?? 0).padStart(3, '0')}_`;
          const extension = path.extname(item.file.name) || '.mp3';
          
          zip.file(`${prefix}${baseFileName}${extension}`, item.file);
          filesAdded++;
        }
      } catch (error) {
        console.error(`Error adding ${item.name} to zip:`, error);
        toast.error(`Failed to add ${item.name} to package.`);
      }
    }
    
    if (filesAdded > 0) {
      toast.promise(
        zip.generateAsync({ type: 'blob' }).then(content => {
          triggerBrowserDownload(
            content,
            `audio_files_${new Date().toISOString().slice(0, 10)}.zip`,
            'application/zip'
          );
        }),
        {
          loading: 'Creating zip file...',
          success: `Downloaded package with ${filesAdded} audio file(s).`,
          error: 'Failed to create zip file.',
        }
      );
    } else {
      toast.error("Failed to add any audio files to the package.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Unified Audio Queue Manager */}
      <AudioQueueManager 
        individualProgressMap={individualProgressMap}
        onReprocessItem={handleReprocessItem}
        requestStopProcessing={stopBatchProcessing}
        setIndividualProgressMap={setIndividualProgressMap}
      />
      
      {audioQueue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Batch Controls & Status</CardTitle>
            <CardDescription>Select model and manage the batch processing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div>
                <Label htmlFor="batch-model-select">Transcription Model</Label>
                <Select
                  value={selectedModel}
                  onValueChange={setSelectedModel}
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

             <div className="flex flex-wrap items-center gap-2">
                <Button
                   onClick={handleStartBatchProcessingAll}
                   disabled={isProcessingBatch || processableCount === 0}
                   className="gap-2"
                >
                  <Play className="h-4 w-4" />
                  Process All ({processableCount})
                </Button>
                <Button
                   variant="outline"
                   onClick={handleStartBatchProcessingNew}
                   disabled={isProcessingBatch || pendingCount === 0}
                   className="gap-2"
                >
                   <Play className="h-4 w-4" />
                   Process Pending ({pendingCount})
                </Button>
                {isProcessingBatch && (
                   <Button
                      variant="destructive"
                      onClick={handleStopBatchProcessing}
                      className="gap-2"
                   >
                      <StopCircle className="h-4 w-4" />
                      Stop
                   </Button>
                )}
             </div>

              <div className="flex flex-wrap items-center gap-2 mt-2"> 
                 <Button
                   variant="outline"
                   onClick={handleDownloadAllTranscriptions}
                   disabled={audioQueue.filter(i => i.transcriptionStatus === 'completed').length === 0}
                   className="gap-2"
                 >
                   <Archive className="h-4 w-4" />
                   Download Package ({audioQueue.filter(i => i.transcriptionStatus === 'completed').length})
                 </Button>
                 <Button
                   variant="outline"
                   onClick={handleDownloadOnlyTranscriptions}
                   disabled={audioQueue.filter(i => i.transcriptionStatus === 'completed').length === 0}
                   className="gap-2"
                 >
                   <FileText className="h-4 w-4" />
                   Download Transcriptions ({audioQueue.filter(i => i.transcriptionStatus === 'completed').length})
                 </Button>
                 <Button
                   variant="outline"
                   onClick={handleDownloadAudioOnly}
                   disabled={audioQueue.filter(i => i.file).length === 0}
                   className="gap-2"
                 >
                   <FileDown className="h-4 w-4" />
                   Download Audio ({audioQueue.filter(i => i.file).length})
                 </Button>
                 <Button
                   variant="outline"
                   onClick={handleDownloadMetadata}
                   disabled={audioQueue.length === 0}
                   className="gap-2"
                 >
                   <FileSpreadsheet className="h-4 w-4" />
                   Download Metadata ({audioQueue.length})
                 </Button>
              </div>

             {isProcessingBatch && (
               <div className="pt-4 border-t">
                  <Label>Batch Progress</Label>
                  <Progress value={batchProgress} className="h-2 mt-1 mb-2" />
                  <div className="text-xs text-muted-foreground flex justify-between">
                     <span>
                       Processing item {currentBatchItemIndex !== null ? currentBatchItemIndex + 1 : '-'} / {getQueue().length}...
                       {currentProcessingId && ` (${getItemById(currentProcessingId)?.name || '...'})`} 
                     </span>
                     <span>{formatTime(batchElapsedTime)} elapsed</span>
                  </div>
               </div>
             )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}