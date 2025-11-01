"use client";

import React, { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, StopCircle } from "lucide-react";
import { ProcessingModeSelector } from "@/components/processing-mode-selector";
import { useBatchQueueStore } from "@/store/batchQueueStore";
import { MP3Quality, DEFAULT_MP3_QUALITY } from "@/utils/audio-utils";
import { ProcessingStrategyFactory, ProcessingStrategy } from "@/strategies/processing-strategy";
import { OnDemandProcessor } from "@/strategies/on-demand-processor";
import { toast } from "sonner";

// Import the existing BatchProcessor for now - we'll extract components from it later
import BatchProcessor from "@/components/batch-processor";
import BatchJobManager from "@/components/batch-job-manager";

interface AudioQueueManagerProps {
  individualProgressMap?: Record<string, {
    isProcessing: boolean;
    progress: number;
    isSplitting: boolean;
    splittingProgress: number;
    currentPartIndex: number | null;
    totalParts: number;
    fileName: string;
    fileSize: number;
    partElapsedTime: number;
  }>;
  onReprocessItem: (itemId: string) => void;
  requestStopProcessing?: () => void;
  setIndividualProgressMap?: (callback: (prev: Record<string, any>) => Record<string, any>) => void;
}

export function AudioQueueManager({ 
  individualProgressMap, 
  onReprocessItem, 
  requestStopProcessing,
  setIndividualProgressMap
}: AudioQueueManagerProps) {
  const { 
    processingMode, 
    setProcessingMode,
    selectedModel,
    setSelectedModel,
    batchJobId,
    batchStatus,
    audioQueue,
    isProcessingBatch,
    getQueue,
    completionWindow,
    setCompletionWindow
  } = useBatchQueueStore();

  const [selectedQuality, setSelectedQuality] = useState<MP3Quality>(DEFAULT_MP3_QUALITY);
  const processingStrategyRef = useRef<ProcessingStrategy | null>(null);

  // Initialize processing strategy when mode changes
  useEffect(() => {
    const initializeStrategy = async () => {
      try {
        processingStrategyRef.current = await ProcessingStrategyFactory.create(processingMode);
        
        // Set up progress callback for on-demand processing
        if (processingStrategyRef.current instanceof OnDemandProcessor && setIndividualProgressMap) {
          processingStrategyRef.current.syncWithProgressMap(setIndividualProgressMap);
        }
      } catch (error) {
        console.error(`Error initializing ${processingMode} strategy:`, error);
        processingStrategyRef.current = null;
      }
    };

    initializeStrategy();
  }, [processingMode, setIndividualProgressMap]);

  // Calculate processable items count
  const processableItems = audioQueue.filter(item => 
    item.file && 
    item.extractionStatus !== 'extracting' && 
    item.extractionStatus !== 'downloading' && 
    item.transcriptionStatus !== 'processing' &&
    item.transcriptionStatus !== 'completed' &&
    (item.transcriptionStatus === 'pending' || item.transcriptionStatus === 'failed')
  );

  const handleStartProcessing = async () => {
    if (!processingStrategyRef.current) {
      toast.error(`${processingMode} processing strategy not available.`);
      return;
    }

    if (processableItems.length === 0) {
      toast.info("No items ready for processing.");
      return;
    }

    try {
      await processingStrategyRef.current.processItems(processableItems);
    } catch (error) {
      console.error("Error during processing:", error);
      toast.error("Processing failed. Check console for details.");
    }
  };

  const handleStopProcessing = async () => {
    if (processingStrategyRef.current && processingStrategyRef.current.canStop()) {
      await processingStrategyRef.current.stopProcessing();
    } else if (requestStopProcessing) {
      requestStopProcessing();
    }
  };

  return (
    <div className="space-y-6">
      {/* Processing Mode Selector */}
      <ProcessingModeSelector 
        value={processingMode}
        onChange={setProcessingMode}
        disabled={false} // TODO: Disable when processing is active
      />

      {/* Model and Quality Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>
            Select transcription model and audio quality settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Model Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Transcription Model</label>
            <select 
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full p-2 border rounded-md"
            >
              <option value="groq-distil-whisper">Groq Distil Whisper (English only, fastest)</option>
              <option value="groq-whisper-large-v3">Groq Whisper Large v3 (Multilingual)</option>
              <option value="groq-whisper-large-v3-turbo">Groq Whisper Large v3 Turbo (Fastest multilingual)</option>
              {processingMode === 'on-demand' && (
                <>
                  <option value="whisper-tiny">Whisper Tiny (Local)</option>
                  <option value="whisper-base">Whisper Base (Local)</option>
                  <option value="whisper-small">Whisper Small (Local)</option>
                  <option value="whisper-medium">Whisper Medium (Local)</option>
                </>
              )}
            </select>
          </div>

          {/* Quality Selector for YouTube */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Audio Quality (YouTube)</label>
            <select 
              value={selectedQuality}
              onChange={(e) => setSelectedQuality(e.target.value as MP3Quality)}
              className="w-full p-2 border rounded-md"
            >
              <option value="high">High Quality (320kbps)</option>
              <option value="medium">Medium Quality (192kbps)</option>
              <option value="low">Low Quality (128kbps)</option>
            </select>
          </div>

          {/* Completion Window for Batch Mode */}
          {processingMode === 'batch' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Completion Window (Batch Mode)</label>
              <select 
                value={completionWindow}
                onChange={(e) => setCompletionWindow(e.target.value as '24h' | '7d')}
                className="w-full p-2 border rounded-md"
              >
                <option value="24h">24 Hours (Faster processing)</option>
                <option value="7d">7 Days (Higher completion rate)</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {completionWindow === '24h' 
                  ? 'Faster processing but may expire if Groq is busy'
                  : 'Longer window ensures completion even during peak times'
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Batch Job Status (only show in batch mode) */}
      {processingMode === 'batch' && batchJobId && (
        <Card>
          <CardHeader>
            <CardTitle>Batch Job Status</CardTitle>
            <CardDescription>
              Current batch job: {batchJobId.slice(0, 8)}...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                batchStatus === 'completed' ? 'bg-green-500' :
                batchStatus === 'processing' ? 'bg-blue-500 animate-pulse' :
                batchStatus === 'failed' ? 'bg-red-500' :
                'bg-yellow-500'
              }`} />
              <span className="capitalize">{batchStatus || 'preparing'}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Processing Controls */}
      {audioQueue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Processing Controls</CardTitle>
            <CardDescription>
              Start, stop, and monitor your {processingMode} processing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={handleStartProcessing}
                disabled={isProcessingBatch || processableItems.length === 0}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                {processingMode === 'on-demand' ? 'Process Queue' : 'Submit Batch'} ({processableItems.length})
              </Button>
              
              {(isProcessingBatch || (processingStrategyRef.current?.canStop())) && (
                <Button
                  variant="destructive"
                  onClick={handleStopProcessing}
                  className="gap-2"
                >
                  <StopCircle className="h-4 w-4" />
                  Stop Processing
                </Button>
              )}
            </div>
            
            {isProcessingBatch && (
              <div className="pt-2 border-t">
                <div className="text-sm text-muted-foreground">
                  Processing in {processingMode} mode...
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Batch Job Manager - Show when in batch mode */}
      {processingMode === 'batch' && (
        <BatchJobManager />
      )}

      {/* Audio Queue - Use existing BatchProcessor for now */}
      <BatchProcessor 
        individualProgressMap={individualProgressMap}
        onReprocessItem={onReprocessItem}
        requestStopProcessing={requestStopProcessing}
      />
    </div>
  );
}

export default AudioQueueManager;