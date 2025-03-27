"use client";

import React, { useState, useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { 
  Upload, 
  FileAudio, 
  Youtube, 
  List, 
  Trash, 
  Clock, 
  GripVertical,
  Pencil,
  Save,
  X,
  PlaySquare,
  Eye,
  EyeOff,
  Download,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader,
  Archive,
  Loader2,
  FileText
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatTime, formatExtractionCompletionTime } from "@/utils/time-utils";
import { formatFileSize, getAudioDuration, MP3Quality, DEFAULT_MP3_QUALITY } from "@/utils/audio-utils";
import { isValidYouTubeUrl, extractPlaylistId } from "@/services/youtube";
import JSZip from "jszip";
// Import DND Kit components
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { YoutubeInput } from "@/components/youtube-input";
import { AudioPlayer } from "@/components/audio-player";
import { BatchItemAudioPlayer } from "@/components/batch-item-audio-player";
import AudioQualitySelector from "@/components/audio-quality-selector";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

// Define the queued audio item type
export interface QueuedAudioItem {
  id: string;
  name: string;
  source: 'local' | 'youtube-video' | 'youtube-playlist';
  file: File | null;
  url: string | null;
  extractionProgress?: number;
  extractionTime?: number;
  downloadProgress?: number;
  downloadTime?: number;
  extractionStatus?: 'pending' | 'extracting' | 'downloading' | 'completed' | 'failed';
  duration?: number;
  order: number;
  transcriptionStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  transcriptionData?: any;
  transcriptionError?: string;
  transcriptionTime?: number;
  metadata?: {
    youtubeInfo?: any;
    playlistInfo?: { 
      position: number;
      totalItems: number;
      playlistId: string;
    };
  };
}

// Define props for the BatchProcessor component
interface BatchProcessorProps {
  onReprocessItem?: (id: string) => void;
  onStartBatchProcessingAll?: () => void;
  onStartBatchProcessingNew?: () => void;
  onStopBatchProcessing?: () => void;
  onDownloadAllTranscriptions?: () => void;
  isProcessingBatch?: boolean;
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
}

// Define the ref handle type
export interface BatchProcessorHandle {
  audioQueue: QueuedAudioItem[];
  addToQueue: (item: QueuedAudioItem) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  updateQueue: (items: QueuedAudioItem[]) => void;
  onReprocessItem: (id: string) => void;
  selectedModel: string;
}

// Component for editable text (for renaming files)
function EditableText({ value, onSave }: { value: string; onSave: (newValue: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = () => {
    if (editValue.trim() !== "") {
      onSave(editValue);
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center space-x-1">
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="h-7 py-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
        />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave}>
          <Save size={16} />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancel}>
          <X size={16} />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-1">
      <span className="truncate max-w-[200px]" title={value}>{value}</span>
      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => setIsEditing(true)}>
        <Pencil size={14} />
      </Button>
    </div>
  );
}

// Define props for SortableQueueItem
interface SortableQueueItemProps {
  item: QueuedAudioItem;
  onRemove: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  getSourceLabel: (source: QueuedAudioItem['source']) => string;
  formatDuration: (seconds?: number) => string;
  formatExtractionCompletionTime: (seconds: number) => string;
  onReprocess?: (id: string) => void;
  individualProgress?: {
    isProcessing: boolean;
    progress: number;
    isSplitting: boolean;
    splittingProgress: number;
    currentPartIndex: number | null;
    totalParts: number;
    fileName: string;
    fileSize: number;
    partElapsedTime: number;
  };
}

// SortableQueueItem component
function SortableQueueItem({
  item,
  onRemove,
  onRename,
  getSourceLabel,
  formatDuration,
  formatExtractionCompletionTime,
  onReprocess,
  individualProgress
}: SortableQueueItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: item.id });
  
  const [showPreview, setShowPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState<'text' | 'segments' | 'json'>('text');
  const togglePreview = () => setShowPreview(!showPreview);
  
  // Get transcription data if available
  const transcriptionData = (item as any).transcriptionData;
  const transcriptionStatus = (item as any).transcriptionStatus;
  const transcriptionError = (item as any).transcriptionError;
  const transcriptionTime = (item as any).transcriptionTime;
  
  // IMPORTANT: Make sure we're not directly rendering item.extractionProgress 
  // which might be causing the unwanted "0"
  // Instead of accessing it directly, we'll use a local variable and only 
  // render it when explicitly needed
  const extractionProgress = item.extractionProgress;
  
  // Check if we can preview (URL is available)
  const canPreview = !!item.url;
  const hasTranscription = !!transcriptionData;
  
  // Format segments for display
  const formatSegments = () => {
    if (!transcriptionData || !transcriptionData.segments) return '';
    
    return transcriptionData.segments.map((seg: any) => 
      `[${formatTime(seg.start)} → ${formatTime(seg.end)}] ${seg.text}`
    ).join('\n\n');
  };
  
  // Handle audio download
  const handleDownload = () => {
    if (!item.url) return;
    
    // Create a download link
    const a = document.createElement('a');
    a.href = item.url;
    a.download = item.name || 'audio.mp3';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  
  // Handle transcription package download
  const handleDownloadZip = async () => {
    if (!item.url || !transcriptionData) return;
    
    try {
      const baseFileName = item.name.replace(/\.[^/.]+$/, '');
      const zip = new JSZip();
      
      // Add text transcription
      zip.file(`${baseFileName}_transcript.txt`, transcriptionData.text);
      
      // Add JSON transcription
      zip.file(`${baseFileName}_transcript.json`, JSON.stringify(transcriptionData, null, 2));
      
      // Add time-segmented transcription
      const timeSegments = transcriptionData.segments.map((seg: any) => 
        `[${formatTime(seg.start)} → ${formatTime(seg.end)}] ${seg.text}`
      ).join('\n\n');
      zip.file(`${baseFileName}_timeseg.txt`, timeSegments);
      
      // Add the audio file if available
      if (item.file) {
        zip.file(item.name, item.file);
      }
      
      // Generate the ZIP and trigger download
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseFileName}_package.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`Downloaded transcription package for ${item.name}`);
    } catch (error) {
      console.error('Error creating transcription package:', error);
      toast.error('Failed to create transcription package');
    }
  };
  
  return (
    <div 
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className="group border rounded-md overflow-hidden bg-card hover:shadow-sm transition-shadow"
    >
      <div className="flex items-center p-3 gap-2">
        <div 
          className="text-muted-foreground touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 cursor-grab" />
        </div>
        
        <div className="flex-1 min-w-0">
          {/* START CONTENT AREA */}
          <div className="flex items-center">
            <div className="text-sm font-medium mr-2 w-6 text-center">
              {item.order}.
            </div>
            <EditableText
              value={item.name}
              onSave={(newName) => onRename(item.id, newName)}
            />
          </div>
          
          <div className="flex items-center text-xs text-muted-foreground mt-1 flex-wrap">
            <span className="inline-flex items-center mr-3 bg-muted/50 px-2 py-0.5 rounded text-xs">
              {item.source === 'youtube-video' ? <Youtube className="h-3 w-3 mr-1" /> : 
               item.source === 'youtube-playlist' ? <List className="h-3 w-3 mr-1" /> : 
               <FileAudio className="h-3 w-3 mr-1" />}
              {getSourceLabel(item.source)}
            </span>
            {item.duration ? (
              <span className="mr-3 inline-flex items-center">
                <Clock className="h-3 w-3 mr-1" />
                {formatDuration(item.duration)}
              </span>
            ) : null}
            {item.file && (
              <span className="mr-3">{formatFileSize(item.file.size)}</span>
            )}
            {item.metadata?.playlistInfo && (
              <span className="bg-muted/40 px-2 py-0.5 rounded text-xs">
                Playlist item {item.metadata.playlistInfo.position}/{item.metadata.playlistInfo.totalItems}
              </span>
            )}
          </div>
          
          {/* This empty fragment ensures no direct rendering of extractionProgress */}
          {<></>}
          
          {/* Enhanced extraction progress display */}
          {item.extractionStatus === 'extracting' && (
            <div key="extracting" className="mt-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-amber-600">Extracting from YouTube...</span>
                <span>{Math.round(extractionProgress || 0)}%</span>
              </div>
              <Progress value={extractionProgress || 0} className="h-1.5" />
            </div>
          )}
          
          {/* Download progress */}
          {item.extractionStatus === 'downloading' && (
            <div key="downloading" className="mt-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-blue-600">Downloading audio file...</span>
                <span>{Math.round(item.downloadProgress || 0)}%</span>
              </div>
              <Progress value={item.downloadProgress || 0} className="h-1.5" />
            </div>
          )}
          
          {/* Individual progress tracking during transcription */}
          {individualProgress && individualProgress.isProcessing && (
            <div key="individual-progress" className="mt-2 space-y-1">
              {/* Splitting progress */}
              {individualProgress.isSplitting && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-amber-600">
                    <span>Splitting into {individualProgress.totalParts} parts...</span>
                    <span>{individualProgress.splittingProgress}% {individualProgress.partElapsedTime > 0 && `- Time: ${formatTime(individualProgress.partElapsedTime)}`}</span>
                  </div>
                  <Progress value={individualProgress.splittingProgress} className="h-1.5" />
                </div>
              )}
              
              {/* Processing parts progress */}
              {!individualProgress.isSplitting && individualProgress.currentPartIndex !== null && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-blue-600">
                    <span>Processing part {(individualProgress.currentPartIndex + 1)}/{individualProgress.totalParts} of {individualProgress.fileName}</span>
                    <span>{individualProgress.partElapsedTime > 0 ? `Time: ${formatTime(individualProgress.partElapsedTime)}` : ''}</span>
                  </div>
                  <Progress value={individualProgress.progress} className="h-1.5" />
                  {individualProgress.fileSize > 0 && (
                    <div className="text-xs text-muted-foreground">
                      File size: {formatFileSize(individualProgress.fileSize)}
                    </div>
                  )}
                </div>
              )}
              
              {/* Overall progress if not splitting or processing parts */}
              {!individualProgress.isSplitting && individualProgress.currentPartIndex === null && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-amber-600">
                    <span>Processing...</span>
                    <span>{individualProgress.progress}%</span>
                  </div>
                  <Progress value={individualProgress.progress} className="h-1.5" />
                </div>
              )}
            </div>
          )}
          
          {/* Extraction and download times */}
          {item.extractionTime && item.downloadTime && item.extractionStatus === 'completed' && (
            <div key="both-times" className="mt-1 text-xs text-muted-foreground">
              <Clock className="inline-block mr-1 h-3 w-3" />
              Extracted in {formatExtractionCompletionTime(item.extractionTime)}, Downloaded in {formatExtractionCompletionTime(item.downloadTime)}
              {item.transcriptionTime && (
                <span className="ml-2">
                  • Transcribed in {formatExtractionCompletionTime(item.transcriptionTime)}
                </span>
              )}
            </div>
          )}
          
          {item.extractionTime && !item.downloadTime && extractionProgress === 100 && (
            <div key="extraction-time-only" className="mt-1 text-xs text-muted-foreground">
              <Clock className="inline-block mr-1 h-3 w-3" />
              {formatExtractionCompletionTime(item.extractionTime)}
              {item.transcriptionTime && (
                <span className="ml-2">
                  • Transcribed in {formatExtractionCompletionTime(item.transcriptionTime)}
                </span>
              )}
            </div>
          )}
          
          {/* Display transcription status */}
          {transcriptionStatus && (
            <div key="transcription-status" className="mt-1 flex items-center text-xs">
              {transcriptionStatus === 'processing' && (
                <span className="flex items-center text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                  <Loader className="inline-block mr-1 h-3 w-3 animate-spin" />
                  Processing...
                </span>
              )}
              {transcriptionStatus === 'completed' && (
                <span className="flex items-center text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                  <CheckCircle className="inline-block mr-1 h-3 w-3" />
                  Transcription complete
                </span>
              )}
              {transcriptionStatus === 'failed' && (
                <span className="flex items-center text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                  <XCircle className="inline-block mr-1 h-3 w-3" />
                  Failed: {transcriptionError || "Unknown error"}
                </span>
              )}
            </div>
          )}
        </div>
        
        <div className="flex items-center">
          <div className="flex items-center gap-1.5 border-l pl-3">
            {/* Action button groups with improved styling */}
            <div className="flex items-center gap-1.5 mr-1">
              {/* Reprocess button */}
              {onReprocess && (
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8 transition-colors hover:text-primary hover:border-primary"
                  onClick={() => onReprocess(item.id)}
                  title="Reprocess transcription"
                  disabled={(transcriptionStatus === 'processing' && !item.transcriptionError) || (individualProgress && individualProgress.isProcessing)}
                >
                  <RefreshCw size={16} />
                </Button>
              )}
              
              {/* Preview button */}
              {item.url && (
                <Button
                  variant={showPreview ? "secondary" : "outline"}
                  size="icon"
                  className="h-8 w-8 transition-colors"
                  onClick={togglePreview}
                  title={showPreview ? "Hide preview" : "Show preview"}
                >
                  {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
              )}
            </div>
            
            <div className="flex items-center gap-1.5">
              {/* Download audio button */}
              {item.url && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 transition-colors hover:text-primary hover:border-primary"
                  onClick={handleDownload}
                  title="Download audio"
                >
                  <Download size={16} />
                </Button>
              )}
              
              {/* Download transcription package button */}
              {transcriptionStatus === 'completed' && transcriptionData && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 relative transition-colors hover:text-primary hover:border-primary"
                  onClick={handleDownloadZip}
                  title="Download audio and transcription files"
                >
                  <Archive size={16} />
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold">4</span>
                </Button>
              )}
              
              {/* Remove button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-opacity"
                onClick={() => onRemove(item.id)}
                title="Remove from queue"
              >
                <Trash size={16} />
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Preview content */}
      {showPreview && (
        <div className="border-t px-3 py-2 bg-muted/30">
          {hasTranscription ? (
            <div className="space-y-4">
              <Tabs defaultValue="text" value={previewMode} onValueChange={(value) => setPreviewMode(value as 'text' | 'segments' | 'json')}>
                <TabsList className="grid grid-cols-3 h-8">
                  <TabsTrigger value="text" className="text-xs py-1">Text</TabsTrigger>
                  <TabsTrigger value="segments" className="text-xs py-1">With Time</TabsTrigger>
                  <TabsTrigger value="json" className="text-xs py-1">JSON</TabsTrigger>
                </TabsList>
                
                <TabsContent value="text" className="mt-2">
                  <div className="text-sm max-h-36 overflow-y-auto bg-muted/30 p-2 rounded">
                    {transcriptionData.text}
                  </div>
                </TabsContent>
                
                <TabsContent value="segments" className="mt-2">
                  <div className="text-sm max-h-36 overflow-y-auto bg-muted/30 p-2 rounded whitespace-pre-line">
                    {formatSegments()}
                  </div>
                </TabsContent>
                
                <TabsContent value="json" className="mt-2">
                  <div className="text-xs max-h-36 overflow-y-auto bg-muted/30 p-2 rounded">
                    <pre className="whitespace-pre-wrap">{JSON.stringify(transcriptionData, null, 2)}</pre>
                  </div>
                </TabsContent>
              </Tabs>
              
              {/* Always show audio player if URL is available */}
              {(canPreview || item.url) && (
                <div className="mt-2">
                  {hasTranscription ? (
                    <div>
                      <BatchItemAudioPlayer 
                        audioUrl={item.url!} 
                        audioFileName={item.name}
                        onRefreshUrl={async () => {
                          // Refresh the blob URL if this is a local file
                          if (item.file && item.source === 'local') {
                            // Revoke the old URL to prevent memory leaks
                            if (item.url && item.url.startsWith('blob:')) {
                              try {
                                URL.revokeObjectURL(item.url);
                              } catch (e) {
                                console.error('Error revoking URL:', e);
                              }
                            }
                            
                            // Create a new blob URL from the file
                            const newUrl = URL.createObjectURL(item.file);
                            console.log(`Refreshed URL for ${item.name} from ${item.url} to ${newUrl}`);
                            
                            // Update the item's URL in the parent component directly
                            item.url = newUrl;
                            onRename(item.id, item.name);
                            
                            return newUrl;
                          }
                          
                          // If we can't refresh the URL, return the current one
                          return item.url || '';
                        }}
                      />
                    </div>
                  ) : (
                    <div>
                      <BatchItemAudioPlayer 
                        audioUrl={item.url!} 
                        audioFileName={item.name}
                        onRefreshUrl={async () => {
                          // Refresh the blob URL if this is a local file
                          if (item.file && item.source === 'local') {
                            // Revoke the old URL to prevent memory leaks
                            if (item.url && item.url.startsWith('blob:')) {
                              try {
                                URL.revokeObjectURL(item.url);
                              } catch (e) {
                                console.error('Error revoking URL:', e);
                              }
                            }
                            
                            // Create a new blob URL from the file
                            const newUrl = URL.createObjectURL(item.file);
                            console.log(`Refreshed URL for ${item.name} from ${item.url} to ${newUrl}`);
                            
                            // Update the item's URL in the parent component directly
                            item.url = newUrl;
                            onRename(item.id, item.name);
                            
                            return newUrl;
                          }
                          
                          // If we can't refresh the URL, return the current one
                          return item.url || '';
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <BatchItemAudioPlayer 
                audioUrl={item.url!} 
                audioFileName={item.name}
                onRefreshUrl={async () => {
                  // Refresh the blob URL if this is a local file
                  if (item.file && item.source === 'local') {
                    // Revoke the old URL to prevent memory leaks
                    if (item.url && item.url.startsWith('blob:')) {
                      try {
                        URL.revokeObjectURL(item.url);
                      } catch (e) {
                        console.error('Error revoking URL:', e);
                      }
                    }
                    
                    // Create a new blob URL from the file
                    const newUrl = URL.createObjectURL(item.file);
                    console.log(`Refreshed URL for ${item.name} from ${item.url} to ${newUrl}`);
                    
                    // Update the item's URL in the parent component directly
                    item.url = newUrl;
                    onRename(item.id, item.name);
                    
                    return newUrl;
                  }
                  
                  // If we can't refresh the URL, return the current one
                  return item.url || '';
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const BatchProcessor = forwardRef<BatchProcessorHandle, BatchProcessorProps>((props, ref) => {
  // State for the audio queue
  const [audioQueue, setAudioQueue] = useState<QueuedAudioItem[]>([]);
  
  // State for YouTube URL input
  const [youtubeUrl, setYoutubeUrl] = useState<string>("");
  
  // State for tracking extractions
  const [isExtracting, setIsExtracting] = useState<Record<string, boolean>>({});
  const [extractionProgress, setExtractionProgress] = useState<Record<string, number>>({});
  
  // New download progress states
  const [isDownloading, setIsDownloading] = useState<Record<string, boolean>>({});
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  
  // Add state to track number of active extractions
  const [youtubeExtractionsInProgress, setYoutubeExtractionsInProgress] = useState(0);
  
  // State for playlist progress
  const [overallPlaylistProgress, setOverallPlaylistProgress] = useState<{
    current: number;
    total: number;
    elapsedTime: number;
  } | null>(null);
  
  // Add quality state to the component
  const [selectedQuality, setSelectedQuality] = useState<MP3Quality>(DEFAULT_MP3_QUALITY);
  
  // Add transcription model state
  const [selectedModel, setSelectedModel] = useState<string>("groq-distil-whisper");
  
  // Expose the queue and methods to the parent component via ref
  useImperativeHandle(ref, () => ({
    audioQueue,
    addToQueue: (item: QueuedAudioItem) => {
      setAudioQueue(prev => [...prev, item]);
    },
    removeFromQueue: (id: string) => {
      setAudioQueue(prev => {
        const updatedQueue = prev.filter(item => item.id !== id);
        return updateQueueOrders(updatedQueue);
      });
    },
    clearQueue: () => {
      setAudioQueue([]);
    },
    updateQueue: (items: QueuedAudioItem[]) => {
      console.log('BatchProcessor.updateQueue called with items:', items);
      setAudioQueue(currentQueue => {
        // Make sure we're actually updating
        if (JSON.stringify(currentQueue) === JSON.stringify(items)) {
          console.log('Queue unchanged, skipping update');
          return currentQueue;
        }
        
        console.log('Updating queue with new items');
        return [...items];
      });
    },
    onReprocessItem: props.onReprocessItem || (() => {}),
    selectedModel
  }), [audioQueue, props.onReprocessItem, selectedModel]);
  
  // Add logging on queue changes
  useEffect(() => {
    console.log('BatchProcessor: Queue updated', { 
      length: audioQueue.length, 
      items: audioQueue 
    });
    
    // Add toast notification when queue changes
    if (audioQueue.length > 0) {
      toast.info(`Queue has ${audioQueue.length} items`);
    }
  }, [audioQueue]);
  
  // Generate a unique ID for queue items
  const generateId = (): string => {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  };
  
  // Helper function to get audio durations for multiple files
  const getFileDurations = async (files: File[], urls: string[]): Promise<number[]> => {
    try {
      const durations = await Promise.all(
        urls.map(url => getAudioDuration(url).catch(err => {
          console.error(`Error getting duration:`, err);
          return 0; // Default to 0 if there's an error
        }))
      );
      return durations;
    } catch (error) {
      console.error("Error getting audio durations:", error);
      return Array(files.length).fill(0);
    }
  };
  
  // Handle dropping files
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const audioFiles = acceptedFiles.filter(file => file.type.startsWith('audio/'));
    
    if (audioFiles.length === 0) {
      toast.error("Please select audio files only");
      return;
    }
    
    // Create object URLs for each file
    const urls = audioFiles.map(file => URL.createObjectURL(file));
    
    // Get durations for all files
    const durations = await getFileDurations(audioFiles, urls);
    
    // Create queue items from dropped files
    const newItems = audioFiles.map((file, index) => ({
      id: generateId(),
      name: file.name,
      source: 'local' as const,
      file,
      url: urls[index],
      extractionProgress: 100,
      duration: durations[index],
      order: audioQueue.length + index + 1,
      transcriptionStatus: 'pending' as 'pending'
    }));
    
    setAudioQueue(prev => {
      const updatedQueue = [...prev, ...newItems];
      return updateQueueOrders(updatedQueue);
    });
    toast.success(`Added ${audioFiles.length} file${audioFiles.length === 1 ? '' : 's'} to queue`);
  }, [audioQueue.length]);
  
  // Setup dropzone for audio files
  const {
    getRootProps,
    getInputProps,
    isDragActive
  } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a', '.flac', '.aac', '.ogg']
    },
    multiple: true
  });
  
  // Handle YouTube URL submission
  const handleYoutubeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!youtubeUrl.trim()) {
      toast.error("Please enter a YouTube URL");
      return;
    }
    
    if (!isValidYouTubeUrl(youtubeUrl)) {
      toast.error("Invalid YouTube URL");
      return;
    }
    
    // Check if it's a playlist URL
    const playlistId = extractPlaylistId(youtubeUrl);
    if (playlistId) {
      handleYoutubePlaylist(youtubeUrl, playlistId);
    } else {
      handleYoutubeSingleVideo(youtubeUrl);
    }
    
    // Clear the input
    setYoutubeUrl("");
  };
  
  // Handle extraction of a single YouTube video
  const handleYoutubeSingleVideo = async (url: string) => {
    const videoId = generateId();
    let extractionTimer: NodeJS.Timeout | null = null;
    
    try {
      // Update extraction state
      setIsExtracting(prev => ({ ...prev, [videoId]: true }));
      setExtractionProgress(prev => ({ ...prev, [videoId]: 0 }));
      
      // Add placeholder to queue
      const placeholderItem: QueuedAudioItem = {
        id: videoId,
        name: `Extracting from YouTube...`,
        source: 'youtube-video',
        file: null,
        url: null,
        extractionProgress: 0,
        order: audioQueue.length + 1
      };
      
      setAudioQueue(prev => [...prev, placeholderItem]);
      
      // Start timer for extraction
      const startTime = Date.now();
      extractionTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        // Calculate estimated progress (similar to what we did in YouTube extraction)
        const estimatedProgress = Math.min(90, elapsed * 3);
        setExtractionProgress(prev => ({ ...prev, [videoId]: estimatedProgress }));
        
        // Update the queue item with the progress
        setAudioQueue(prev => 
          prev.map(item => 
            item.id === videoId 
              ? { ...item, extractionProgress: estimatedProgress }
              : item
          )
        );
      }, 1000);
      
      // Call API to extract YouTube audio
      const response = await fetch("/api/youtube/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to extract YouTube audio");
      }
      
      const result = await response.json();
      
      // Clear the timer
      if (extractionTimer) {
        clearInterval(extractionTimer);
        extractionTimer = null;
      }
      
      // Mark extraction as complete
      setIsExtracting(prev => ({ ...prev, [videoId]: false }));
      setExtractionProgress(prev => ({ ...prev, [videoId]: 100 }));
      
      // Calculate extraction time
      const extractionTime = Math.floor((Date.now() - startTime) / 1000);
      
      // Download the audio file
      const audioResponse = await fetch(result.audioUrl);
      const blob = await audioResponse.blob();
      const file = new File([blob], `${result.title}.mp3`, { type: 'audio/mpeg' });
      
      // Update the queue item with the actual data
      setAudioQueue(prev => {
        const updated = prev.map(item => 
          item.id === videoId 
            ? { 
                ...item, 
                name: result.title,
                file,
                url: result.audioUrl,
                extractionProgress: 100,
                extractionTime,
                duration: result.duration,
                metadata: {
                  youtubeInfo: result
                }
              }
            : item
        );
        return updateQueueOrders(updated);
      });
      
      toast.success(`Added YouTube video: ${result.title}`);
      
    } catch (error) {
      console.error("Error extracting YouTube video:", error);
      toast.error(`Failed to extract YouTube video: ${error instanceof Error ? error.message : "Unknown error"}`);
      
      // Clear the timer if it's still running
      if (extractionTimer) {
        clearInterval(extractionTimer);
        extractionTimer = null;
      }
      
      // Ensure extraction is marked as false
      setIsExtracting(prev => ({ ...prev, [videoId]: false }));
      
      // Remove the placeholder from queue
      setAudioQueue(prev => prev.filter(item => item.id !== videoId));
    }
  };
  
  // Handle extraction of a YouTube playlist
  const handleYoutubePlaylist = async (url: string, playlistId: string, quality: MP3Quality = selectedQuality) => {
    try {
      toast.info("Processing YouTube playlist. This may take a while...");
      
      // Fetch playlist information
      const response = await fetch(`/api/youtube/playlist?id=${playlistId}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch playlist information");
      }
      
      const playlist = await response.json();
      const videos = playlist.videos || [];
      
      // Show warning message if there are unavailable videos
      if (playlist.unavailable_count && playlist.unavailable_count > 0) {
        const totalCount = videos.length + playlist.unavailable_count;
        toast.warning(
          `${playlist.unavailable_count} out of ${totalCount} videos in this playlist are unavailable and will be skipped.`
        );
      }
      
      if (videos.length === 0) {
        throw new Error("No available videos found in playlist");
      }
      
      // Setup progress tracking
      setOverallPlaylistProgress({
        current: 0,
        total: videos.length,
        elapsedTime: 0
      });
      
      // Start timer
      const startTime = Date.now();
      const timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setOverallPlaylistProgress(prev => 
          prev ? { ...prev, elapsedTime: elapsed } : null
        );
      }, 1000);
      
      // Keep track of successful extractions and failures
      const successCount = { count: 0 };
      const failureCount = { count: 0 };
      
      // Process each video with improved tracking
      for (let i = 0; i < videos.length; i++) {
        try {
          setOverallPlaylistProgress(prev => 
            prev ? { ...prev, current: i + 1 } : null
          );
          
          // Create placeholder with extracting status
          const videoId = generateId();
          const placeholderItem: QueuedAudioItem = {
            id: videoId,
            name: `${i+1}/${videos.length}: ${videos[i].title || 'Loading...'}`,
            source: 'youtube-playlist',
            file: null,
            url: null,
            extractionProgress: 0,
            extractionStatus: 'extracting' as const,
            order: audioQueue.length + i + 1,
            metadata: {
              playlistInfo: {
                position: i + 1,
                totalItems: videos.length,
                playlistId
              }
            }
          };
          
          setAudioQueue(prev => [...prev, placeholderItem]);
          setIsExtracting(prev => ({ ...prev, [videoId]: true }));
          
          // Start timer for this video's extraction
          const videoStartTime = Date.now();
          const videoExtractionTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - videoStartTime) / 1000);
            // Calculate estimated progress
            const estimatedProgress = Math.min(90, elapsed * 3);
            setAudioQueue(prev => 
              prev.map(item => 
                item.id === videoId 
                  ? { ...item, extractionProgress: estimatedProgress }
                  : item
              )
            );
          }, 1000);
          
          try {
            // Call API to extract YouTube audio with quality parameter
            const extractResponse = await fetch("/api/youtube/extract", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ 
                url: videos[i].url,
                quality 
              }),
            });
            
            if (!extractResponse.ok) {
              const errorData = await extractResponse.json();
              throw new Error(errorData.error || `Failed to extract video ${i+1}`);
            }
            
            const result = await extractResponse.json();
            
            // Download the audio file
            const audioResponse = await fetch(result.audioUrl);
            const blob = await audioResponse.blob();
            const file = new File([blob], `${result.title}.mp3`, { type: 'audio/mpeg' });
            
            // Calculate extraction time
            const extractionTime = Math.floor((Date.now() - videoStartTime) / 1000);
            
            // Update the queue item with the actual data
            setAudioQueue(prev => {
              const updated = prev.map(item => 
                item.id === videoId 
                  ? { 
                      ...item, 
                      name: result.title,
                      file,
                      url: result.audioUrl,
                      extractionProgress: 100,
                      extractionTime,
                      duration: result.duration,
                      metadata: {
                        ...item.metadata,
                        youtubeInfo: result
                      }
                    }
                  : item
              );
              return updateQueueOrders(updated);
            });
            
            // Clear the extraction timer
            clearInterval(videoExtractionTimer);
            successCount.count++;
            
          } catch (extractError) {
            console.error(`Error extracting video ${i+1}/${videos.length}:`, extractError);
            clearInterval(videoExtractionTimer);
            failureCount.count++;
            
            // Update the queue item to show failure
            setAudioQueue(prev => 
              prev.map(item => 
                item.id === videoId 
                  ? { 
                      ...item, 
                      name: `[FAILED] ${videos[i].title || `Video ${i+1}`}`,
                      extractionProgress: 0,
                    }
                  : item
              )
            );
            
            // Remove failed items after a short delay
            setTimeout(() => {
              setAudioQueue(prev => {
                const filteredQueue = prev.filter(item => item.id !== videoId);
                return updateQueueOrders(filteredQueue);
              });
            }, 3000);
          }
          
          setIsExtracting(prev => ({ ...prev, [videoId]: false }));
          
        } catch (videoError) {
          console.error(`Error processing video ${i+1}/${videos.length}:`, videoError);
          failureCount.count++;
          // Continue with next video
        }
      }
      
      // Clean up
      clearInterval(timerInterval);
      
      const totalTime = Math.floor((Date.now() - startTime) / 1000);
      
      if (successCount.count > 0) {
        if (failureCount.count > 0) {
          toast.success(`Playlist processing complete! Added ${successCount.count} videos, ${failureCount.count} failed. Total time: ${formatTime(totalTime)}`);
        } else {
          toast.success(`Playlist processing complete! Added ${successCount.count} videos in ${formatTime(totalTime)}`);
        }
      } else {
        toast.error("Failed to extract any videos from the playlist");
      }
      
      setOverallPlaylistProgress(null);
      
    } catch (error) {
      console.error("Error processing playlist:", error);
      toast.error(`Failed to process playlist: ${error instanceof Error ? error.message : "Unknown error"}`);
      setOverallPlaylistProgress(null);
    }
  };
  
  // Remove an item from the queue
  const handleRemoveItem = (id: string) => {
    setAudioQueue(prev => {
      const filteredQueue = prev.filter(item => item.id !== id);
      return updateQueueOrders(filteredQueue);
    });
  };
  
  // Rename an item in the queue
  const handleRenameItem = (id: string, newName: string, newUrl?: string) => {
    setAudioQueue(prev => {
      const updatedQueue = prev.map(item => 
        item.id === id 
          ? { 
              ...item, 
              name: newName,
              // Only update URL if explicitly provided
              ...(newUrl ? { url: newUrl } : {})
            }
          : item
      );
      return updateQueueOrders(updatedQueue);
    });
  };
  
  // Clear the queue
  const handleClearQueue = () => {
    if (window.confirm("Are you sure you want to clear the entire queue?")) {
      setAudioQueue([]);
      toast.info("Queue cleared");
    }
  };
  
  // Clean up blob URLs when component unmounts
  useEffect(() => {
    return () => {
      // Revoke all blob URLs to prevent memory leaks
      audioQueue.forEach(item => {
        if (item.url && item.url.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(item.url);
            console.log(`Cleaned up URL for ${item.name}`);
          } catch (e) {
            console.error('Error revoking URL:', e);
          }
        }
      });
    };
  }, [audioQueue]);
  
  // Get a label for the source type
  const getSourceLabel = (source: QueuedAudioItem['source']): string => {
    switch (source) {
      case 'local':
        return 'Local File';
      case 'youtube-video':
        return 'YouTube Video';
      case 'youtube-playlist':
        return 'YouTube Playlist';
      default:
        return 'Unknown Source';
    }
  };
  
  // Format duration for display
  const formatDuration = (seconds?: number): string => {
    if (!seconds) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Handle drag and drop reordering
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setAudioQueue(items => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        
        const reordered = arrayMove(items, oldIndex, newIndex);
        
        // Update order property for all items
        return updateQueueOrders(reordered);
      });
    }
  };
  
  // Utility function to update order numbers for all items in queue
  const updateQueueOrders = (queue: QueuedAudioItem[]): QueuedAudioItem[] => {
    return queue.map((item, index) => ({
      ...item,
      order: index + 1
    }));
  };
  
  // Setup sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // Handle YouTube video extraction with improved progress tracking
  const handleYoutubeVideo = async (url: string, videoId: string, quality: MP3Quality = selectedQuality) => {
    // Generate a unique ID for this queue item
    const id = generateId();
    
    // Keep track of the extraction timer
    let extractionTimer: NodeJS.Timeout | null = null;
    let downloadTimer: NodeJS.Timeout | null = null;
    
    try {
      // Set extraction state
      setIsExtracting(prev => ({ ...prev, [videoId]: true }));
      setExtractionProgress(prev => ({ ...prev, [videoId]: 0 }));
      
      // Create a placeholder item in the queue
      const placeholderItem: QueuedAudioItem = {
        id: videoId,
        name: `Extracting from YouTube...`,
        source: 'youtube-video',
        file: null,
        url: null,
        extractionProgress: 0,
        extractionStatus: 'extracting' as const,
        order: audioQueue.length + 1
      };
      
      setAudioQueue(prev => [...prev, placeholderItem]);
      
      // Start timer for extraction phase
      const extractionStart = Date.now();
      extractionTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - extractionStart) / 1000);
        // Calculate estimated progress for extraction phase (max 95%)
        const estimatedProgress = Math.min(95, elapsed * 5);
        setExtractionProgress(prev => ({ ...prev, [videoId]: estimatedProgress }));
        
        // Update the queue item with the progress
        setAudioQueue(prev => 
          prev.map(item => 
            item.id === videoId 
              ? { ...item, extractionProgress: estimatedProgress }
              : item
          )
        );
      }, 1000);
      
      // Call API to extract YouTube audio with quality parameter
      const response = await fetch("/api/youtube/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          url,
          quality 
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to extract YouTube audio");
      }
      
      const result = await response.json();
      
      // Clear the extraction timer
      if (extractionTimer) {
        clearInterval(extractionTimer);
        extractionTimer = null;
      }
      
      // Mark extraction phase complete
      const extractionTime = Math.floor((Date.now() - extractionStart) / 1000);
      setExtractionProgress(prev => ({ ...prev, [videoId]: 100 }));
      
      // Begin download phase
      setIsDownloading(prev => ({ ...prev, [videoId]: true }));
      setDownloadProgress(prev => ({ ...prev, [videoId]: 0 }));
      
      // Update queue item to show downloading status
      setAudioQueue(prev => 
        prev.map(item => 
          item.id === videoId 
            ? { 
                ...item, 
                name: `Downloading: ${result.title}`,
                extractionStatus: 'downloading' as const,
                extractionTime,
                downloadProgress: 0
              }
            : item
        )
      );
      
      // Start timer for download phase
      const downloadStart = Date.now();
      downloadTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - downloadStart) / 1000);
        // Estimate download progress (max 95%)
        const estimatedProgress = Math.min(95, elapsed * 10);
        setDownloadProgress(prev => ({ ...prev, [videoId]: estimatedProgress }));
        
        // Update the queue item with download progress
        setAudioQueue(prev => 
          prev.map(item => 
            item.id === videoId 
              ? { ...item, downloadProgress: estimatedProgress }
              : item
          )
        );
      }, 1000);
      
      // Download the audio file with progress tracking if possible
      const audioResponse = await fetch(result.audioUrl);
      const blob = await audioResponse.blob();
      const file = new File([blob], `${result.title}.mp3`, { type: 'audio/mpeg' });
      
      // Clear the download timer
      if (downloadTimer) {
        clearInterval(downloadTimer);
        downloadTimer = null;
      }
      
      // Mark download as complete
      setIsDownloading(prev => ({ ...prev, [videoId]: false }));
      setDownloadProgress(prev => ({ ...prev, [videoId]: 100 }));
      const downloadTime = Math.floor((Date.now() - downloadStart) / 1000);
      
      // Mark extraction as complete
      setIsExtracting(prev => ({ ...prev, [videoId]: false }));
      
      // Log file size and quality
      console.log(`YouTube audio extracted (quality: ${quality}) - Size: ${file.size} bytes (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);
      
      // Update the queue item with the actual data
      setAudioQueue(prev => {
        const updated = prev.map(item => 
          item.id === videoId 
            ? { 
                ...item, 
                name: result.title,
                file,
                url: result.audioUrl,
                extractionProgress: 100,
                downloadProgress: 100,
                extractionTime,
                downloadTime,
                extractionStatus: 'completed' as const,
                duration: result.duration,
                metadata: {
                  youtubeInfo: result
                }
              }
            : item
        );
        return updateQueueOrders(updated);
      });
      
      toast.success(`Added YouTube video: ${result.title}`);
      
    } catch (error) {
      console.error("Error extracting YouTube video:", error);
      toast.error(`Failed to extract YouTube video: ${error instanceof Error ? error.message : "Unknown error"}`);
      
      // Clear timers if they're still running
      if (extractionTimer) {
        clearInterval(extractionTimer);
        extractionTimer = null;
      }
      if (downloadTimer) {
        clearInterval(downloadTimer);
        downloadTimer = null;
      }
      
      // Ensure extraction is marked as false
      setIsExtracting(prev => ({ ...prev, [videoId]: false }));
      setIsDownloading(prev => ({ ...prev, [videoId]: false }));
      
      // Update queue item to show failure
      setAudioQueue(prev => 
        prev.map(item => 
          item.id === videoId 
            ? { ...item, extractionStatus: 'failed' as const, name: `[FAILED] ${item.name}` }
            : item
        )
      );
      
      // Optional: Remove failed item after a delay
      setTimeout(() => {
        setAudioQueue(prev => {
          const filteredQueue = prev.filter(item => item.id !== videoId);
          return updateQueueOrders(filteredQueue);
        });
      }, 5000);
    }
  };
  
  // Define props for SortableQueueItem rendering
  const renderQueueItem = (item: QueuedAudioItem) => (
    <SortableQueueItem
      key={item.id}
      item={item}
      onRemove={handleRemoveItem}
      onRename={handleRenameItem}
      getSourceLabel={getSourceLabel}
      formatDuration={formatDuration}
      formatExtractionCompletionTime={formatExtractionCompletionTime}
      onReprocess={props.onReprocessItem}
      individualProgress={props.individualProgressMap?.[item.id]}
    />
  );
  
  // Add this function to handle downloading all transcriptions
  const handleBatchDownloadTranscriptions = async (items: QueuedAudioItem[]) => {
    const itemsWithTranscription = items.filter(item => item.transcriptionStatus === 'completed' && item.transcriptionData);
    
    if (itemsWithTranscription.length === 0) {
      toast.error("No completed transcriptions found");
      return;
    }
    
    let downloadCount = 0;
    
    // Process each transcription
    for (const item of itemsWithTranscription) {
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
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${baseFileName}_transcription.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
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
  
  // Update count when extractions start/finish
  useEffect(() => {
    const count = Object.values(isExtracting).filter(Boolean).length;
    setYoutubeExtractionsInProgress(count);
  }, [isExtracting]);
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Batch Audio Processor</CardTitle>
        <CardDescription>
          Upload multiple audio files or YouTube videos for batch processing
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="youtube" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="local">Local Files</TabsTrigger>
            <TabsTrigger value="youtube">YouTube</TabsTrigger>
          </TabsList>
          
          <TabsContent value="local" className="mt-4">
            <div {...getRootProps({ className: "border-2 border-dashed rounded-md p-6 hover:border-primary/50 transition cursor-pointer" })}>
              <input {...getInputProps()} />
              <div className="flex flex-col items-center justify-center gap-2 text-center">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <h3 className="text-base font-semibold">Drag & drop audio files</h3>
                <p className="text-sm text-muted-foreground">Or click to browse your computer</p>
                <p className="text-xs text-muted-foreground mt-2">Supported formats: MP3, WAV, M4A, FLAC, AAC, OGG</p>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="youtube" className="mt-4">
            <div className="pt-4 pb-2">
              <div className="mb-2">
                <Label>Add YouTube Video or Playlist</Label>
              </div>
              <div className="flex flex-col gap-3">
                {/* Make YouTube URL input take full width row with YouTube icon */}
                <div className="relative w-full">
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                    <Youtube className="h-4 w-4" />
                  </div>
                  <Input
                    className="w-full pl-10 transition-colors focus-visible:ring-1 focus-visible:ring-ring"
                    type="text"
                    placeholder="Enter YouTube video or playlist URL"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                  />
                </div>
                
                {/* Create a row with Audio Quality and Extract button side by side with improved styling */}
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <AudioQualitySelector
                      value={selectedQuality}
                      onChange={setSelectedQuality}
                      label="Audio Quality"
                      className="w-full"
                    />
                  </div>
                  <Button 
                    className="mt-7 px-4 h-10 transition-all hover:shadow-md" 
                    disabled={!youtubeUrl.trim()}
                    onClick={() => {
                      // Parse the URL to check if it's a playlist
                      const playlistId = extractPlaylistId(youtubeUrl);
                      if (playlistId) {
                        handleYoutubePlaylist(youtubeUrl, playlistId);
                      } else {
                        // Try to extract a video ID
                        const videoId = generateId();
                        handleYoutubeVideo(youtubeUrl, videoId);
                      }
                      // Clear the input after adding to queue
                      setYoutubeUrl("");
                    }}
                  >
                    {youtubeExtractionsInProgress > 0 ? (
                      <>
                        <PlaySquare className="mr-2 h-4 w-4" /> Queue Extraction ({youtubeExtractionsInProgress} in progress)
                      </>
                    ) : (
                      <>
                        <PlaySquare className="mr-2 h-4 w-4" /> Add to Queue
                      </>
                    )}
                  </Button>
                </div>
                
                {/* Info text and extraction status */}
                <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">
                  Supports YouTube video links, shorts, and playlists. For videos in playlists, you'll be asked if you want to extract the entire playlist.
                </div>
                
                {/* Show extraction in progress status */}
                {youtubeExtractionsInProgress > 0 && (
                  <div className="text-xs text-amber-600 mt-1 flex items-center">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    {youtubeExtractionsInProgress} YouTube extraction{youtubeExtractionsInProgress > 1 ? 's' : ''} in progress
                  </div>
                )}
              </div>
            </div>
            
            {/* Extraction Statistics Section */}
            {youtubeExtractionsInProgress > 0 && Object.values(isDownloading).some(Boolean) && (
              <div className="mt-4 p-3 border rounded-md bg-muted/30">
                <h4 className="text-sm font-medium mb-2">Extraction Progress</h4>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span>{youtubeExtractionsInProgress} active extraction{youtubeExtractionsInProgress > 1 ? 's' : ''}</span>
                    <span>{Object.values(isDownloading).filter(Boolean).length} download{Object.values(isDownloading).filter(Boolean).length !== 1 ? 's' : ''} in progress</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* YouTube Playlist Progress with improved styling */}
            {overallPlaylistProgress && (
              <div className="mt-4 p-3 border rounded-md bg-muted/30 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Extracting video {overallPlaylistProgress.current} of {overallPlaylistProgress.total}</span>
                  <span className="text-muted-foreground">{formatTime(overallPlaylistProgress.elapsedTime)}</span>
                </div>
                <Progress value={(overallPlaylistProgress.current / overallPlaylistProgress.total) * 100} className="h-2" />
              </div>
            )}
          </TabsContent>
        </Tabs>
        
        {/* Audio Queue */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Audio Queue ({audioQueue.length})</h3>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleClearQueue}
                disabled={audioQueue.length === 0}
                className="hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
              >
                <Trash className="h-4 w-4 mr-1" /> Clear All
              </Button>
            </div>
          </div>
          
          {audioQueue.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={audioQueue.map(item => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {audioQueue.map(renderQueueItem)}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="text-center py-8 text-muted-foreground border rounded-md bg-muted/10">
              <div className="flex flex-col items-center gap-2">
                <List className="h-8 w-8 text-muted-foreground/50" />
                <p>No audio files in queue. Add files using the options above.</p>
              </div>
            </div>
          )}
          
          {/* Batch Processing Controls section */}
          {audioQueue.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4">Batch Processing Controls</h3>
              <div className="border rounded-lg bg-muted/10 shadow-sm overflow-hidden">
                {/* 1. Transcription Model section */}
                <div className="p-3 pb-2">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Transcription Model</h4>
                  <div className="flex items-center">
                    <Select
                      disabled={audioQueue.length === 0}
                      value={selectedModel}
                      onValueChange={setSelectedModel}
                    >
                      <SelectTrigger className="w-full">
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
                </div>
                
                {/* Divider */}
                <div className="border-t"></div>
                
                {/* 2. Processing Controls Row */}
                <div className="p-3 pb-2">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Processing Controls</h4>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="default"
                      onClick={() => {
                        if (props.onStartBatchProcessingAll) {
                          props.onStartBatchProcessingAll();
                        } else if (props.onReprocessItem) {
                          props.onReprocessItem('all');
                        }
                      }}
                      className="gap-2 px-4 h-10 hover:shadow-md transition-all"
                      disabled={audioQueue.length === 0 || props.isProcessingBatch}
                    >
                      <PlaySquare className="h-4 w-4" />
                      Process All
                    </Button>
                    
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (props.onStartBatchProcessingNew) {
                          props.onStartBatchProcessingNew();
                        } else if (props.onReprocessItem) {
                          props.onReprocessItem('new');
                        }
                      }}
                      className="gap-2 hover:border-primary hover:text-primary transition-colors"
                      disabled={audioQueue.length === 0 || props.isProcessingBatch}
                    >
                      <PlaySquare className="h-4 w-4" />
                      Process New
                    </Button>
                    
                    {props.isProcessingBatch && (
                      <Button
                        variant="destructive"
                        onClick={() => props.onStopBatchProcessing && props.onStopBatchProcessing()}
                        className="gap-2"
                      >
                        <X className="h-4 w-4" />
                        Stop Processing
                      </Button>
                    )}
                  </div>
                </div>
                
                {/* Divider */}
                <div className="border-t"></div>
                
                {/* 3. Download Options Row */}
                <div className="p-3 pt-2">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Download Options</h4>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        // Create a zip file for all downloadable items
                        const zip = new JSZip();

                        // Count for successfully added items
                        let audioCount = 0;
                        let transcriptionCount = 0;

                        // Process each queue item
                        for (const item of audioQueue) {
                          try {
                            // Skip items without a URL
                            if (!item.url) continue;

                            // Get proper filename and extension
                            const originalFileName = item.name;
                            // Extract extension from the name or use .mp3 as default
                            const hasExtension = /\.(mp3|wav|m4a|ogg|flac|aac)$/i.test(originalFileName);
                            const baseFileName = hasExtension ? originalFileName.substring(0, originalFileName.lastIndexOf('.')) : originalFileName;
                            const extension = hasExtension ? originalFileName.substring(originalFileName.lastIndexOf('.')) : '.mp3';
                            
                            // Create unique filename prefix with item order number for sorting and avoiding conflicts
                            const prefix = `${String(item.order).padStart(2, '0')}_`;
                            
                            // Filename for the audio file
                            const audioFileName = `${prefix}${baseFileName}${extension}`;

                            // Fetch the audio file
                            const audioResponse = await fetch(item.url);
                            const audioBlob = await audioResponse.blob();
                            
                            // Add audio file to the zip directly in the root
                            zip.file(audioFileName, audioBlob);
                            audioCount++;

                            // If the item has transcription data, add it in different formats
                            if (item.transcriptionStatus === 'completed' && item.transcriptionData) {
                              // Add text transcription
                              zip.file(`${prefix}${baseFileName}_transcript.txt`, item.transcriptionData.text);
                              
                              // Add JSON transcription (full data)
                              zip.file(`${prefix}${baseFileName}_transcript.json`, JSON.stringify(item.transcriptionData, null, 2));
                              
                              // Add time-segmented text if segments are available
                              if (item.transcriptionData.segments && item.transcriptionData.segments.length > 0) {
                                const timeSegments = item.transcriptionData.segments.map((seg: any) => 
                                  `[${formatTime(seg.start)} → ${formatTime(seg.end)}] ${seg.text}`
                                ).join('\n\n');
                                zip.file(`${prefix}${baseFileName}_timeseg.txt`, timeSegments);
                              }
                              
                              transcriptionCount++;
                            }
                          } catch (error) {
                            console.error(`Error adding ${item.name} to zip:`, error);
                            toast.error(`Failed to add ${item.name} to the package: ${error instanceof Error ? error.message : "Unknown error"}`);
                          }
                        }

                        // Only generate and download if we added any files
                        if (audioCount > 0) {
                          try {
                            // Generate the ZIP
                            const content = await zip.generateAsync({ type: 'blob' });
                            
                            // Create a download link
                            const url = URL.createObjectURL(content);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `audio_collection_${new Date().toISOString().slice(0, 10)}.zip`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                            
                            // Show success message with counts
                            if (transcriptionCount > 0) {
                              toast.success(`Downloaded package with ${audioCount} audio file${audioCount !== 1 ? 's' : ''} and ${transcriptionCount} transcription${transcriptionCount !== 1 ? 's' : ''}`);
                            } else {
                              toast.success(`Downloaded package with ${audioCount} audio file${audioCount !== 1 ? 's' : ''}`);
                            }
                          } catch (error) {
                            console.error("Error creating zip file:", error);
                            toast.error("Failed to create download package");
                          }
                        } else {
                          toast.error("No audio files available to download");
                        }
                      }}
                      className="gap-2 hover:border-primary hover:text-primary transition-colors"
                      disabled={audioQueue.length === 0}
                    >
                      <Download className="h-4 w-4" />
                      Download Package
                      {audioQueue.filter(item => !!item.url).length > 0 && (
                        <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium">
                          {audioQueue.filter(item => !!item.url).length}
                        </span>
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => {
                        if (props.onDownloadAllTranscriptions) {
                          props.onDownloadAllTranscriptions();
                        } else {
                          handleBatchDownloadTranscriptions(audioQueue);
                        }
                      }}
                      className="gap-2 hover:border-primary hover:text-primary transition-colors"
                      disabled={!audioQueue.some(item => item.transcriptionStatus === 'completed' && item.transcriptionData)}
                    >
                      <FileText className="h-4 w-4" />
                      Download Transcription
                      {audioQueue.filter(item => item.transcriptionStatus === 'completed' && item.transcriptionData).length > 0 && (
                        <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium">
                          {audioQueue.filter(item => item.transcriptionStatus === 'completed' && item.transcriptionData).length}
                        </span>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

BatchProcessor.displayName = "BatchProcessor";

export default BatchProcessor; 