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
  Archive
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
import { formatFileSize, getAudioDuration } from "@/utils/audio-utils";
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

// Define the queued audio item type
export interface QueuedAudioItem {
  id: string;
  name: string;
  source: 'local' | 'youtube-video' | 'youtube-playlist';
  file: File | null;
  url: string | null;
  extractionProgress?: number;
  extractionTime?: number;
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
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-md border bg-card shadow-sm group"
    >
      <div className="flex items-center p-3">
        <div 
          className="mr-2 text-muted-foreground touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 cursor-grab" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center">
            <div className="text-sm font-medium mr-2">
              {item.order}.
            </div>
            <EditableText
              value={item.name}
              onSave={(newName) => onRename(item.id, newName)}
            />
          </div>
          
          <div className="flex items-center text-xs text-muted-foreground">
            <span className="mr-2">{getSourceLabel(item.source)}</span>
            {item.duration ? (
              <span>{formatDuration(item.duration)}</span>
            ) : null}
            {item.file && (
              <span className="ml-2">{formatFileSize(item.file.size)}</span>
            )}
            {item.metadata?.playlistInfo && (
              <span className="ml-2">
                Playlist item {item.metadata.playlistInfo.position}/{item.metadata.playlistInfo.totalItems}
              </span>
            )}
          </div>
          
          {/* Extraction progress */}
          {item.extractionProgress !== undefined && item.extractionProgress < 100 && (
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span>Extracting...</span>
                <span>{Math.round(item.extractionProgress)}%</span>
              </div>
              <Progress value={item.extractionProgress} className="h-1" />
            </div>
          )}
          
          {/* Individual progress tracking */}
          {individualProgress && individualProgress.isProcessing && (
            <div className="mt-2 space-y-1">
              {/* Splitting progress */}
              {individualProgress.isSplitting && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-amber-600">
                    <span>Splitting into {individualProgress.totalParts} parts...</span>
                    <span>{individualProgress.splittingProgress}% {individualProgress.partElapsedTime > 0 && `- Time: ${Math.floor(individualProgress.partElapsedTime / 60)}m ${individualProgress.partElapsedTime % 60}s`}</span>
                  </div>
                  <Progress value={individualProgress.splittingProgress} className="h-1" />
                </div>
              )}
              
              {/* Processing parts progress */}
              {!individualProgress.isSplitting && individualProgress.currentPartIndex !== null && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-blue-600">
                    <span>Processing part {(individualProgress.currentPartIndex + 1)}/{individualProgress.totalParts} of {individualProgress.fileName}</span>
                    <span>{individualProgress.partElapsedTime > 0 ? `Time: ${Math.floor(individualProgress.partElapsedTime / 60)}m ${individualProgress.partElapsedTime % 60}s` : ''}</span>
                  </div>
                  <Progress value={individualProgress.progress} className="h-1" />
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
                  <Progress value={individualProgress.progress} className="h-1" />
                </div>
              )}
            </div>
          )}
          
          {/* Extraction time */}
          {item.extractionTime && item.extractionProgress === 100 && (
            <div className="mt-1 text-xs text-muted-foreground">
              <Clock className="inline-block mr-1 h-3 w-3" />
              {formatExtractionCompletionTime(item.extractionTime)}
              {transcriptionTime && (
                <span className="ml-2">
                  • Transcribed in {formatExtractionCompletionTime(transcriptionTime)}
                </span>
              )}
            </div>
          )}
          
          {/* Display transcription status */}
          {transcriptionStatus && (
            <div className="mt-1 flex items-center text-xs">
              {transcriptionStatus === 'processing' && (
                <span className="flex items-center text-amber-600">
                  <Loader className="inline-block mr-1 h-3 w-3 animate-spin" />
                  Processing...
                </span>
              )}
              {transcriptionStatus === 'completed' && (
                <span className="flex items-center text-green-600">
                  <CheckCircle className="inline-block mr-1 h-3 w-3" />
                  Transcription complete
                </span>
              )}
              {transcriptionStatus === 'failed' && (
                <span className="flex items-center text-red-600">
                  <XCircle className="inline-block mr-1 h-3 w-3" />
                  Failed: {transcriptionError || "Unknown error"}
                </span>
              )}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          {/* Reprocess button - always show but disable during processing */}
          {onReprocess && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => onReprocess(item.id)}
              title="Reprocess transcription"
              disabled={transcriptionStatus === 'processing' || (individualProgress && individualProgress.isProcessing)}
            >
              <RefreshCw size={16} />
            </Button>
          )}
          
          {/* Preview button - show if URL exists */}
          {item.url && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={togglePreview}
              title={showPreview ? "Hide preview" : "Show preview"}
            >
              {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
            </Button>
          )}
          
          {/* Download audio button - show if URL exists */}
          {item.url && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleDownload}
              title="Download audio"
            >
              <Download size={16} />
            </Button>
          )}
          
          {/* Download transcription package button - only for completed transcriptions */}
          {transcriptionStatus === 'completed' && transcriptionData && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 relative"
              onClick={handleDownloadZip}
              title="Download audio and transcription files"
            >
              <Archive size={16} />
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full w-3 h-3 flex items-center justify-center text-[8px]">4</span>
            </Button>
          )}
          
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-500 opacity-0 group-hover:opacity-100"
            onClick={() => onRemove(item.id)}
            title="Remove from queue"
          >
            <Trash size={16} />
          </Button>
        </div>
      </div>
      
      {/* Preview content */}
      {showPreview && (
        <div className="border-t px-3 py-2">
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
  const [youtubeUrl, setYoutubeUrl] = useState("");
  
  // State for tracking extractions
  const [isExtracting, setIsExtracting] = useState<Record<string, boolean>>({});
  const [extractionProgress, setExtractionProgress] = useState<Record<string, number>>({});
  
  // State for playlist progress
  const [overallPlaylistProgress, setOverallPlaylistProgress] = useState<{
    current: number;
    total: number;
    elapsedTime: number;
  } | null>(null);
  
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
      setAudioQueue([...items]);
    },
    onReprocessItem: props.onReprocessItem || (() => {})
  }), [audioQueue, props.onReprocessItem]);
  
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
  const handleYoutubePlaylist = async (url: string, playlistId: string) => {
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
      
      // Process each video
      for (let i = 0; i < videos.length; i++) {
        try {
          setOverallPlaylistProgress(prev => 
            prev ? { ...prev, current: i + 1 } : null
          );
          
          // Create placeholder for this video
          const videoId = generateId();
          const placeholderItem: QueuedAudioItem = {
            id: videoId,
            name: `${i+1}/${videos.length}: ${videos[i].title || 'Loading...'}`,
            source: 'youtube-playlist',
            file: null,
            url: null,
            extractionProgress: 0,
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
            // Call API to extract YouTube audio
            const extractResponse = await fetch("/api/youtube/extract", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ url: videos[i].url }),
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
  
  // Handle a single YouTube video
  const handleYoutubeVideo = async (url: string, videoId: string) => {
    // Generate a unique ID for this queue item
    const id = generateId();
    
    try {
      toast.info("Extracting audio from YouTube. This may take a while...");
      
      // Create placeholder for this item
      const placeholderItem: QueuedAudioItem = {
        id,
        name: "Extracting YouTube audio...",
        source: 'youtube-video',
        file: null,
        url: null,
        extractionProgress: 0,
        order: audioQueue.length + 1,
      };
      
      setAudioQueue(prev => [...prev, placeholderItem]);
      setIsExtracting(prev => ({ ...prev, [id]: true }));
      
      // Start timer for extraction
      const startTime = Date.now();
      const extractionTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        // Calculate estimated progress (3% per second, up to 90%)
        const estimatedProgress = Math.min(90, elapsed * 3);
        setAudioQueue(prev => 
          prev.map(item => 
            item.id === id 
              ? { ...item, extractionProgress: estimatedProgress }
              : item
          )
        );
      }, 1000);
      
      try {
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
          throw new Error(error.error || "Failed to extract YouTube audio");
        }
        
        const result = await response.json();
        
        // If there are warnings, log them
        if (result.warnings && result.warnings.length > 0) {
          console.warn("YouTube extraction warnings:", result.warnings);
        }
        
        // Download the audio file
        const audioResponse = await fetch(result.audioUrl);
        const blob = await audioResponse.blob();
        const file = new File([blob], `${result.title}.mp3`, { type: 'audio/mpeg' });
        
        // Stop timer and calculate extraction time
        clearInterval(extractionTimer);
        const extractionTime = Math.floor((Date.now() - startTime) / 1000);
        
        toast.success(`Added YouTube video: ${result.title}`);
        
        // Update queue item with actual data
        setAudioQueue(prev => 
          prev.map(item => 
            item.id === id 
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
          )
        );
        
      } catch (extractError) {
        // Clear the timer
        clearInterval(extractionTimer);
        
        console.error("Error extracting YouTube video:", extractError);
        toast.error(`Failed to extract YouTube video: ${extractError instanceof Error ? extractError.message : "Unknown error"}`);
        
        // Update the queue item to show failure
        setAudioQueue(prev => 
          prev.map(item => 
            item.id === id 
              ? { 
                  ...item, 
                  name: `[FAILED] YouTube Extraction`,
                  extractionProgress: 0,
                }
              : item
          )
        );
        
        // Remove failed item after a delay
        setTimeout(() => {
          setAudioQueue(prev => prev.filter(item => item.id !== id));
        }, 3000);
      }
      
      setIsExtracting(prev => ({ ...prev, [id]: false }));
      
    } catch (error) {
      console.error("Error handling YouTube video:", error);
      toast.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
      setIsExtracting(prev => ({ ...prev, [id]: false }));
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
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Batch Audio Processor</CardTitle>
        <CardDescription>
          Upload multiple audio files or YouTube videos for batch processing
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="local" className="w-full">
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
            <YoutubeInput 
              onVideoExtract={handleYoutubeVideo} 
              onPlaylistExtract={handleYoutubePlaylist}
              disabled={Object.values(isExtracting).some(v => v)}
            />
            
            {/* YouTube Playlist Progress */}
            {overallPlaylistProgress && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Extracting video {overallPlaylistProgress.current} of {overallPlaylistProgress.total}</span>
                  <span>{formatTime(overallPlaylistProgress.elapsedTime)}</span>
                </div>
                <Progress value={(overallPlaylistProgress.current / overallPlaylistProgress.total) * 100} />
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
              >
                Clear All
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
            <div className="text-center py-8 text-muted-foreground border rounded-md">
              No audio files in queue. Add files using the options above.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

BatchProcessor.displayName = "BatchProcessor";

export default BatchProcessor; 