"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
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
  FileText,
  RotateCcw
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatTime, formatExtractionCompletionTime, timeStringToSeconds } from "@/lib/time-utils";
import { formatFileSize, getAudioDuration, MP3Quality, DEFAULT_MP3_QUALITY } from "@/lib/audio-utils";
import { isValidYouTubeUrl, extractPlaylistId } from "@/lib/youtube";
import JSZip from "jszip";
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
import { BatchItemAudioPlayer } from "@/components/batch-item-audio-player";
import AudioQualitySelector from "@/components/audio-quality-selector";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { useBatchQueueStore } from "@/stores/batchQueueStore";
import { QueuedAudioItem } from "@shared/types";
import { EnhancedQueuedAudioItem } from "@/stores/batchQueueStore";

interface BatchProcessorProps {
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
}

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
      <span className="truncate max-w-[200px] text-sm" title={value}>{value}</span>
      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => setIsEditing(true)}>
        <Pencil size={14} />
      </Button>
    </div>
  );
}

interface SortableQueueItemProps {
  item: EnhancedQueuedAudioItem;
  getSourceLabel: (source: EnhancedQueuedAudioItem['source']) => string;
  formatDuration: (seconds?: number) => string;
  formatExtractionCompletionTime: (seconds: number) => string;
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
  onReprocessItem: (itemId: string) => void;
}

function SortableQueueItem({
  item,
  getSourceLabel,
  formatDuration,
  formatExtractionCompletionTime,
  individualProgress,
  onReprocessItem
}: SortableQueueItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: item.id });
  
  const { removeFromQueue, updateItem, clearItemResult } = useBatchQueueStore();

  const [showPreview, setShowPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState<'text' | 'segments' | 'json'>('text');
  const [showAudioPlayer, setShowAudioPlayer] = useState(false);
  const [audioSrc, setAudioSrc] = useState<string | undefined>(undefined);

  const { 
    id, name, source, duration, url, file, metadata,
    transcriptionStatus, 
    transcriptionData, 
    transcriptionError, 
    transcriptionTime,
    extractionProgress,
    extractionStatus,
    extractionTime,
    downloadProgress,
    downloadTime
  } = item;
  
  const canPreview = !!url;
  const hasTranscription = !!transcriptionData && transcriptionStatus === 'completed';

  useEffect(() => {
    let objectUrl: string | undefined;
    if (item.file) {
      objectUrl = URL.createObjectURL(item.file);
      setAudioSrc(objectUrl);
      console.log(`[Player Src] Using Blob URL for ${item.name}:`, objectUrl);
    } else if (item.url) {
      setAudioSrc(item.url);
      console.log(`[Player Src] Using item.url for ${item.name}:`, item.url);
    } else {
      setAudioSrc(undefined);
      console.log(`[Player Src] No source for ${item.name}`);
    }

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        console.log(`[Player Cleanup] Revoked Blob URL for ${item.name}:`, objectUrl);
      }
    };
  }, [item.file, item.url]);

  const togglePreview = () => setShowPreview(!showPreview);
  const toggleAudioPlayer = () => setShowAudioPlayer(!showAudioPlayer);

  const handleRename = (newName: string) => {
    if (newName.trim() !== name) {
      updateItem(id, { name: newName });
      toast.info(`Renamed item to "${newName}"`);
    }
  };

  const handleRemove = () => {
    removeFromQueue(id);
    toast.warning(`Removed "${name}" from queue.`);
  };

  const handleReprocess = () => {
    console.log(`Requesting reprocessing for item: ${id}`);
    onReprocessItem(id);
    toast.info(`Marked "${name}" for reprocessing.`);
  };

  const handleDownloadZip = async () => {
    if (!transcriptionData) {
      toast.error("No transcription data available to download.");
      return;
    }
    
    try {
      const baseFileName = name.replace(/\.[^/.]+$/, '');
      const zip = new JSZip();
      
      zip.file(`${baseFileName}_transcript.txt`, transcriptionData.text || '');
      
      zip.file(`${baseFileName}_transcript.json`, JSON.stringify(transcriptionData, null, 2));
      
      if (transcriptionData.segments && transcriptionData.segments.length > 0) {
         const timeSegments = transcriptionData.segments.map((seg) => 
           `[${formatTime(seg.start)} --> ${formatTime(seg.end)}] ${seg.text}`
         ).join('\n\n');
         zip.file(`${baseFileName}_timeseg.txt`, timeSegments);
      }
      
      if (file) {
        zip.file(name, file);
      } else if (url) {
        try {
          toast.info('Fetching audio file for download package...');
          const audioResponse = await fetch(url);
          if (!audioResponse.ok) throw new Error(`Failed to fetch audio (${audioResponse.status})`);
          const audioBlob = await audioResponse.blob();
          zip.file(name, audioBlob);
        } catch (fetchError) {
          console.error('Error fetching audio for zip:', fetchError);
          toast.warning(`Could not include audio file in package: ${fetchError instanceof Error ? fetchError.message : 'Fetch failed'}`);
        }
      }
      
      toast.promise(
         zip.generateAsync({ type: 'blob' }).then(content => {
           const downloadUrl = URL.createObjectURL(content);
           const a = document.createElement('a');
           a.href = downloadUrl;
           a.download = `${baseFileName}_transcription_package.zip`;
           document.body.appendChild(a);
           a.click();
           document.body.removeChild(a);
           URL.revokeObjectURL(downloadUrl);
         }),
         {
           loading: 'Creating download package...',
           success: `Downloaded package for ${name}`,
           error: 'Failed to create download package',
         }
       );

    } catch (error) {
      console.error('Error creating transcription package:', error);
      toast.error('Failed to create transcription package');
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      className={`group flex flex-col p-3 mb-2 border rounded-md bg-background shadow-sm relative overflow-hidden ${individualProgress?.isProcessing ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center flex-grow min-w-0">
          <button {...listeners} className="cursor-grab p-1 mr-2 text-muted-foreground hover:bg-muted rounded">
            <GripVertical size={18} />
          </button>
          <div className="mr-2 text-muted-foreground">
            {source === 'local' && <FileAudio size={18} />}
            {source === 'youtube-video' && <Youtube size={18} />}
            {source === 'youtube-playlist' && <List size={18} />}
          </div>
          <div className="flex-grow min-w-0 mr-2">
            <EditableText value={name} onSave={handleRename} />
          </div>
        </div>
        <div className="flex items-center flex-shrink-0 space-x-3">
          <span className="text-xs text-muted-foreground hidden sm:inline">{getSourceLabel(source)}</span>
          {item.file?.size && (
            <span className="text-xs text-muted-foreground">{formatFileSize(item.file.size)}</span>
          )}
          <span className="text-xs text-muted-foreground">
            {extractionStatus === 'pending' 
              ? 'Duration: --:--'
              : `Duration: ${formatDuration(duration)}`
            }
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={handleRemove}>
            <Trash size={16} />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground ml-9 mb-1">
        {extractionStatus === 'extracting' && (
          <div className="flex items-center space-x-1">
            <Loader size={14} className="animate-spin text-blue-500" />
            <span>Extracting... ({Math.round(extractionProgress ?? 0)}%)</span>
          </div>
        )}
        {extractionStatus === 'downloading' && (
          <div className="flex items-center space-x-1">
            <Download size={14} className="animate-pulse text-blue-500" />
            <span>Downloading... ({Math.round(downloadProgress ?? 0)}%)</span>
          </div>
        )}
        {(extractionStatus === 'completed' || (!extractionStatus && source === 'local')) && (extractionTime || downloadTime) && (
          <div className="flex items-center space-x-1 text-green-600">
            <CheckCircle size={14} />
            <span>Prepared {source !== 'local' ? `in ${formatExtractionCompletionTime(extractionTime || downloadTime || 0)}` : ''}</span>
          </div>
        )}
        {extractionStatus === 'failed' && (
          <div className="flex items-center space-x-1 text-red-600">
            <XCircle size={14} />
            <span>Preparation Failed</span>
          </div>
        )}

        {(extractionStatus === 'completed' || extractionStatus === 'pending' || !extractionStatus) && (
          <>
            {transcriptionStatus === 'pending' && (
              <div className="flex items-center space-x-1">
                <Clock size={14} />
                <span>Pending Transcription</span>
              </div>
            )}
            {transcriptionStatus === 'processing' && (
              <div className="flex items-center space-x-1 text-blue-500">
                <Loader2 size={14} className="animate-spin" />
                <span>Processing...</span>
              </div>
            )}
            {transcriptionStatus === 'completed' && (
              <div className="flex items-center space-x-1 text-green-600">
                <CheckCircle size={14} />
                <span>Completed {transcriptionTime ? `in ${formatTime(transcriptionTime)}` : ''}</span>
              </div>
            )}
            {transcriptionStatus === 'failed' && (
              <div className="flex items-center space-x-1 text-red-600">
                <XCircle size={14} />
                <span>Failed{transcriptionError ? `: ${transcriptionError.substring(0, 30)}...` : ''}</span>
              </div>
            )}
          </>
        )}
      </div>
      
      <div className="flex items-center justify-end space-x-2 mt-1 ml-9">
        {(item.url || item.file) && (
           <Button
             variant="outline"
             size="sm"
             onClick={toggleAudioPlayer}
             title={showAudioPlayer ? "Hide player" : "Show player"}
           >
             <PlaySquare size={14} className="mr-1"/>
             {showAudioPlayer ? 'Hide Player' : 'Play Audio'}
           </Button>
         )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleReprocess}
          disabled={extractionStatus === 'extracting' || extractionStatus === 'downloading' || individualProgress?.isProcessing}
          title="Reset and mark for reprocessing"
        >
          <RefreshCw size={14} className="mr-1"/>
          Reprocess
        </Button>
        {hasTranscription && (
           <Button variant="outline" size="sm" onClick={togglePreview} title={showPreview ? "Hide preview" : "Show preview"}>
            {showPreview ? <EyeOff size={14} className="mr-1"/> : <Eye size={14} className="mr-1"/>}
            {showPreview ? 'Hide' : 'Preview'}
          </Button>
        )}
        {hasTranscription && (
          <Button variant="outline" size="sm" onClick={handleDownloadZip} title="Download transcription package (TXT, JSON, Audio)">
            <Archive size={14} className="mr-1" />
            Package
          </Button>
        )}
      </div>
      
      {individualProgress?.isProcessing && (
        <div className="mt-2 ml-9">
          <Progress value={individualProgress.progress} className="h-2" />
          <div className="text-xs text-muted-foreground mt-1">
            {individualProgress.isSplitting 
              ? `Splitting: ${individualProgress.splittingProgress.toFixed(0)}% (${individualProgress.fileName})`
              : `Part ${individualProgress.currentPartIndex ?? '-'}/${individualProgress.totalParts} (${formatFileSize(individualProgress.fileSize)}) - ${formatTime(individualProgress.partElapsedTime)} elapsed`
            }
          </div>
        </div>
      )}

      {showAudioPlayer && audioSrc && (
        <div className="mt-3 ml-9">
           <BatchItemAudioPlayer audioUrl={audioSrc} audioFileName={item.name} />
        </div>
      )}

      {showPreview && hasTranscription && (
        <div className="mt-3 p-3 border-t bg-muted/30 rounded-b-md ml-9">
          <div className="flex justify-between items-center mb-2">
             <Tabs defaultValue="text" onValueChange={(value) => setPreviewMode(value as any)}>
                 <TabsList className="inline-flex h-7 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground gap-1">
                   <TabsTrigger value="text" className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm h-6">Text</TabsTrigger>
                   <TabsTrigger value="segments" className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm h-6">Segments</TabsTrigger>
                   <TabsTrigger value="json" className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm h-6">JSON</TabsTrigger>
                 </TabsList>
               </Tabs>
          </div>

          <div className="text-sm max-h-40 overflow-y-auto p-2 bg-background rounded border">
            {previewMode === 'text' && <pre className="whitespace-pre-wrap text-xs">{transcriptionData?.text || 'No text available.'}</pre>}
            {previewMode === 'segments' && (
              <ul className="space-y-1">
                {transcriptionData?.segments?.map((seg, index) => (
                  <li key={index} className="text-xs">
                    <span className="font-mono text-muted-foreground mr-2">[{formatTime(seg.start)}-{formatTime(seg.end)}]</span>
                    {seg.text}
                  </li>
                )) || <li>No segments available.</li>}
              </ul>
            )}
            {previewMode === 'json' && <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(transcriptionData, null, 2)}</pre>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BatchProcessor({ individualProgressMap, onReprocessItem, requestStopProcessing }: BatchProcessorProps) {
  const {
    audioQueue,
    addToQueue,
    removeFromQueue,
    updateQueueOrder,
    updateItem,
    clearQueue,
    getQueue
  } = useBatchQueueStore();

  // Check for resubmit file list in localStorage
  const [resubmitInfo, setResubmitInfo] = useState<{
    jobId: string;
    files: { filename: string; size: number }[];
  } | null>(null);

  useEffect(() => {
    const resubmitData = localStorage.getItem('resubmitFileList');
    if (resubmitData) {
      try {
        const parsed = JSON.parse(resubmitData);
        setResubmitInfo(parsed);
      } catch (error) {
        console.error('Error parsing resubmit data:', error);
        localStorage.removeItem('resubmitFileList');
      }
    }
  }, []);

  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [selectedQuality, setSelectedQuality] = useState<MP3Quality>(DEFAULT_MP3_QUALITY);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  const getSourceLabel = (source: EnhancedQueuedAudioItem['source']): string => {
    switch (source) {
      case 'local': return 'Local File';
      case 'youtube-video': return 'YouTube Video';
      case 'youtube-playlist': return 'Playlist Item';
      default: return 'Unknown';
    }
  };

  const formatDuration = (seconds?: number): string => {
    if (seconds === undefined || seconds === null || isNaN(seconds)) return '--:--';
    return formatTime(seconds);
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    let addedCount = 0;
    const currentFiles = getQueue();
    const existingFileNames = new Set(currentFiles.filter(item => item.source === 'local').map(item => item.file?.name));

    for (const file of acceptedFiles) {
      try {
        if (existingFileNames.has(file.name)) {
          toast.warning(`Skipped duplicate local file: ${file.name}`, {
            description: "File already exists in the queue. Rename the file if you need to add it again.",
          });
          continue;
        }

        // Create a temporary ID for this file
        const tempId = `${file.name}-${file.size}-${Date.now()}`;

        // First add to queue without duration
        const newItem: QueuedAudioItem = {
          id: tempId,
          name: file.name,
          source: 'local',
          file: file,
          url: null,
          duration: undefined,
          order: getQueue().length,
          extractionStatus: 'pending'
        };
        addToQueue(newItem);
        addedCount++;

        // After adding to queue, get the duration immediately
        try {
          toast.info(`Preparing local file: ${file.name}...`, { id: `prepare-${tempId}` });
          const blobUrl = URL.createObjectURL(file);
          const duration = await getAudioDuration(blobUrl);
          URL.revokeObjectURL(blobUrl); // Revoke immediately after getting duration
          
          // Update the item with duration and mark as completed
          updateItem(tempId, { 
            duration: duration, 
            extractionStatus: 'completed'
          });
          
          toast.success(`Prepared local file: ${file.name}`, { id: `prepare-${tempId}` });
        } catch (durationErr) {
          console.error(`Error getting duration for ${file.name}:`, durationErr);
          // Don't fail the whole upload if duration detection fails
          toast.error(`Could not detect duration for ${file.name}, but file was added`);
        }
      } catch (error) {
        console.error("Error processing dropped file:", file.name, error);
        toast.error(`Error adding file ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    if (addedCount > 0) {
      toast.success(`Added ${addedCount} local file(s) to the queue.`);
    }
  }, [addToQueue, getQueue, updateItem]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'audio/*': [] },
    noClick: true,
  });

  const handleSingleVideoSubmit = useCallback(async (url: string) => {
    toast.info("Extracting audio from YouTube video...");
    
    const currentQueue = getQueue();
    const urlExists = currentQueue.some(item => item.url === url);
    if (urlExists) {
        toast.warning(`Skipped duplicate URL: ${url.substring(0, 60)}...`, {
            description: "URL already exists in the queue.",
        });
        return;
    }

    const extractionStartTime = Date.now();
    const tempItemId = `youtube-extract-${Date.now()}`;

    // First, create a temporary item in the queue
    const newItem: QueuedAudioItem = {
      id: tempItemId,
      name: `Preparing: ${url.substring(0, 50)}...`,
      source: 'youtube-video',
      file: null,
      url: url,
      order: getQueue().length,
      extractionStatus: 'extracting',
      extractionProgress: 0,
      duration: undefined
    };
    addToQueue(newItem);

    try {
      // First attempt to get video info without extracting to set duration early
      // This will help with metadata export before extraction completes
      try {
        // Use a lightweight API call to get video metadata first
        const infoResponse = await fetch("/api/youtube/info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        
        if (infoResponse.ok) {
          const infoResult = await infoResponse.json();
          // Update item with preliminary info
          if (infoResult.title && infoResult.duration) {
            updateItem(tempItemId, {
              name: infoResult.title,
              duration: typeof infoResult.duration === 'number' 
                ? infoResult.duration 
                : timeStringToSeconds(infoResult.duration) || undefined,
              metadata: { 
                youtubeInfo: { 
                  id: infoResult.id,
                  title: infoResult.title,
                  duration_string: infoResult.duration
                }
              }
            });
          }
        }
      } catch (infoError) {
        // Don't fail completely if we can't get preliminary info
        console.warn("Failed to get preliminary video info:", infoError);
      }

      // Now proceed with the full extraction
      const response = await fetch("/api/youtube/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, quality: selectedQuality }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Extraction failed (status ${response.status})`);
      }

      const result = await response.json();
      const extractionEndTime = Date.now();
      const calculatedExtractionTime = (extractionEndTime - extractionStartTime) / 1000;
      
      toast.success(`Audio extracted: ${result.title}`);
      
      updateItem(tempItemId, {
        name: result.title || `Download: ${url.substring(0,40)}...`,
        extractionStatus: 'downloading',
        extractionTime: calculatedExtractionTime,
        extractionProgress: 100,
        downloadProgress: 0,
        duration: result.duration,
        metadata: { 
          ...newItem.metadata, 
          youtubeInfo: {
            ...result,
            // Keep the original string format if needed
            duration_string: typeof result.duration === 'string' ? result.duration : undefined
          }, 
          tempFileName: result.tempFileName 
        },
        transcriptionStatus: 'pending'
      });
      
      const downloadStartTime = Date.now();
      
      const audioResponse = await fetch(result.audioUrl);
      if (!audioResponse.ok) {
        throw new Error(`Failed to download extracted audio (status ${audioResponse.status})`);
      }
      
      const audioBlob = await audioResponse.blob();
      const downloadedFile = new File([audioBlob], result.title ? `${result.title}.mp3` : `youtube_audio_${Date.now()}.mp3`, { type: 'audio/mpeg' });
      const downloadEndTime = Date.now();
      const calculatedDownloadTime = (downloadEndTime - downloadStartTime) / 1000;

      updateItem(tempItemId, {
        name: downloadedFile.name,
        file: downloadedFile,
        duration: result.duration,
        extractionStatus: 'completed', 
        extractionTime: calculatedExtractionTime,
        downloadProgress: 100,
        downloadTime: calculatedDownloadTime,
        metadata: { 
          ...newItem.metadata, 
          youtubeInfo: {
            ...result,
            duration_string: typeof result.duration === 'string' ? result.duration : undefined
          }, 
          tempFileName: result.tempFileName 
        },
        transcriptionStatus: 'pending'
      });
      
    } catch (error) {
      console.error("Error handling YouTube URL:", error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown extraction error';

      if (/unavailable|removed from youtube|404/i.test(errorMsg)) { 
         toast.error(`Video unavailable: ${url.substring(0, 50)}...`, { description: "Removing from queue." });
         removeFromQueue(tempItemId);
      } else {
          toast.error(`Failed to prepare video: ${errorMsg.substring(0, 60)}...`);
          updateItem(tempItemId, {
              name: `Failed: ${url.substring(0,50)}...`,
              extractionStatus: 'failed',
              extractionError: errorMsg,
              transcriptionStatus: 'failed',
              transcriptionError: 'Preparation failed'
          });
      }
    }
  }, [selectedQuality, addToQueue, getQueue, updateItem, removeFromQueue]);

  const extractPlaylistItemAudio = async (item: QueuedAudioItem) => {
    if (!item.url) {
      updateItem(item.id, { extractionStatus: 'failed', extractionError: 'Missing URL', transcriptionStatus: 'failed', transcriptionError: 'Missing URL' });
      return;
    }

    const videoIdMatch = item.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([^&\?/]+)/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;
    
    const currentQueue = getQueue();
    const isDuplicateId = currentQueue.some(otherItem => {
        if (otherItem.id === item.id) return false;

        if (otherItem.metadata?.youtubeInfo?.id === videoId) {
          return true;
        }

        if (otherItem.url && (otherItem.extractionStatus === 'pending' || otherItem.extractionStatus === 'extracting')) {
            const otherVideoIdMatch = otherItem.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([^&\?/]+)/);
            const otherVideoId = otherVideoIdMatch ? otherVideoIdMatch[1] : null;
            if (otherVideoId === videoId) {
                return true;
            }
        }
        return false;
    });

    if (videoId && isDuplicateId) {
        const existingItem = currentQueue.find(i => i.metadata?.youtubeInfo?.id === videoId);
        toast.warning(`Duplicate video ID found: ${item.name} (ID: ${videoId})`, {
            description: `Already processed as "${existingItem?.name || 'another item'}". Removing this duplicate entry.`,
        });
        removeFromQueue(item.id);
        return;
    }

    updateItem(item.id, { extractionStatus: 'extracting', extractionProgress: 0 });
    const extractionStartTime = Date.now();

    try {
      const response = await fetch("/api/youtube/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.url, quality: selectedQuality }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Extraction failed (status ${response.status})`);
      }

      const result = await response.json();
      const extractionEndTime = Date.now();
      const calculatedExtractionTime = (extractionEndTime - extractionStartTime) / 1000;

      updateItem(item.id, {
        name: result.title || item.name,
        extractionStatus: 'downloading',
        extractionTime: calculatedExtractionTime,
        extractionProgress: 100,
        downloadProgress: 0,
        // Use existing duration if available, otherwise use the one from extraction
        duration: item.duration || result.duration,
        metadata: { 
          ...item.metadata, 
          youtubeInfo: {
            ...result,
            duration_string: typeof result.duration === 'string' ? result.duration : undefined
          }, 
          tempFileName: result.tempFileName 
        },
        transcriptionStatus: 'pending'
      });

      const downloadStartTime = Date.now();
      const audioResponse = await fetch(result.audioUrl);
      if (!audioResponse.ok) {
        throw new Error(`Failed to download extracted audio (status ${audioResponse.status})`);
      }

      const audioBlob = await audioResponse.blob();
      const downloadedFile = new File([audioBlob], result.title ? `${result.title}.mp3` : `youtube_audio_${Date.now()}.mp3`, { type: 'audio/mpeg' });
      const downloadEndTime = Date.now();
      const calculatedDownloadTime = (downloadEndTime - downloadStartTime) / 1000;

      updateItem(item.id, {
        file: downloadedFile,
        extractionStatus: 'completed',
        downloadProgress: 100,
        downloadTime: calculatedDownloadTime,
        // Use existing duration if available, otherwise use the one from extraction
        duration: item.duration || result.duration,
        metadata: { 
          ...item.metadata, 
          youtubeInfo: {
            ...result,
            duration_string: typeof result.duration === 'string' ? result.duration : undefined
          }, 
          tempFileName: result.tempFileName 
        },
        transcriptionStatus: 'pending'
      });

      toast.success(`Audio prepared for: ${result.title || item.name}`);

    } catch (error) {
      console.error(`Error processing playlist item ${item.name}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown extraction error';

      if (/unavailable|removed from youtube|404/i.test(errorMessage)) {
          toast.error(`Video unavailable: ${item.name}`, { description: "Removing from queue." });
          removeFromQueue(item.id);
      } else {
          toast.error(`Failed to prepare audio for ${item.name}: ${errorMessage.substring(0, 50)}...`);
          updateItem(item.id, {
            extractionStatus: 'failed',
            extractionError: errorMessage,
            transcriptionStatus: 'failed',
            transcriptionError: 'Preparation failed'
          });
      }
    }
  };

  const handlePlaylistSubmit = useCallback(async (url: string, playlistId: string) => {
     toast.info(`Fetching playlist info for ID: ${playlistId}...`);
       try {
        const response = await fetch(`/api/youtube/playlist?id=${playlistId}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Failed to fetch playlist (status ${response.status})`);
        }
        const data = await response.json();
        
        if (!data.videos || data.videos.length === 0) {
          toast.warning("Playlist is empty or contains no available videos.");
          return;
        }

        // Show summary of playlist status
        if (data.summary && data.summary.unavailable > 0) {
          const { available, unavailable, deleted, private: privateCount } = data.summary;
          toast.info(
            `Playlist loaded: ${available} available videos, ${unavailable} unavailable (${deleted} deleted, ${privateCount} private)`,
            { duration: 5000 }
          );
        }

        const currentQueueLength = getQueue().length;
        const existingUrls = new Set(getQueue().map(item => item.url));
        const existingVideoIds = new Set(getQueue().filter(item => item.metadata?.youtubeInfo?.id).map(item => item.metadata!.youtubeInfo!.id));

        let addedVideos = 0;
        let skippedCount = 0;
        let unavailableSkipped = 0;

        for (let i = 0; i < data.videos.length; i++) {
          const video = data.videos[i];

          // Skip unavailable videos
          if (video.unavailable) {
            unavailableSkipped++;
            console.log(`Skipping unavailable video: ${video.title} (${video.reason})`);
            continue;
          }

          if (video.id && existingVideoIds.has(video.id)) {
             console.log(`Skipping duplicate video: ${video.title}`);
             skippedCount++;
             continue;
          }

          // Convert duration from string format to seconds if needed
          let durationInSeconds;
          if (typeof video.duration === 'number') {
            durationInSeconds = video.duration;
          } else if (typeof video.duration === 'string') {
            // Try to parse the duration string to seconds
            const durationParts = video.duration.split(':').map(Number);
            if (durationParts.length === 2) {
              // MM:SS format
              durationInSeconds = (durationParts[0] * 60) + durationParts[1];
            } else if (durationParts.length === 3) {
              // HH:MM:SS format
              durationInSeconds = (durationParts[0] * 3600) + (durationParts[1] * 60) + durationParts[2];
            }
          }

          const newItem: QueuedAudioItem = { 
            id: `youtube-${video.id}-${Date.now()}`,
            name: video.title || `Playlist Video ${i + 1}`,
            source: 'youtube-playlist',
            file: null,
            url: video.url,
            duration: durationInSeconds,
            order: currentQueueLength + addedVideos,
            extractionStatus: 'pending', 
            metadata: {
              youtubeInfo: { 
                id: video.id, 
                title: video.title,
                duration_string: video.duration, // Store original duration string for reference
              },
              playlistInfo: { 
                position: i + 1, 
                totalItems: data.videos.length, 
                playlistId: playlistId
              }
            }
          };
          addToQueue(newItem);
          addedVideos++;

          extractPlaylistItemAudio(newItem).catch(err => {
             console.error(`Background extraction trigger failed for ${newItem.name}`, err);
          });
        }
        // Build success message with detailed information
        let message = `Added ${addedVideos} video(s) from playlist "${data.title || 'Playlist'}". Starting audio preparation...`;
        const skipInfo = [];
        if (skippedCount > 0) skipInfo.push(`${skippedCount} duplicate(s)`);
        if (unavailableSkipped > 0) skipInfo.push(`${unavailableSkipped} unavailable`);
        if (skipInfo.length > 0) {
          message += ` (skipped: ${skipInfo.join(', ')})`;
        }
        
        toast.success(message);

      } catch (error) {
        console.error("Error fetching playlist:", error);
        toast.error(`Failed to add playlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
  }, [addToQueue, getQueue, selectedQuality, updateItem, removeFromQueue]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = audioQueue.findIndex((item) => item.id === active.id);
      const newIndex = audioQueue.findIndex((item) => item.id === over.id);
      const newQueue = arrayMove(audioQueue, oldIndex, newIndex);
      const reorderedQueue = newQueue.map((item, index) => ({ ...item, order: index }));
      updateQueueOrder(reorderedQueue);
    }
  };

  const handleClearQueue = () => {
    // Call the stop request first
    requestStopProcessing?.();
    // Then clear the store queue
    clearQueue();
    toast.info("Audio queue cleared.");
    setShowClearConfirm(false);
  };

  useEffect(() => {
    const urlsToRevoke = audioQueue
      .filter(item => item.source === 'local' && item.url && item.url.startsWith('blob:'))
      .map(item => item.url);

    return () => {
      urlsToRevoke.forEach(url => {
        if (url) {
          try {
            URL.revokeObjectURL(url);
            console.log("[Processor Cleanup] Revoked blob URL:", url);
          } catch (e) {
            console.error('[Processor Cleanup] Error revoking URL:', e);
          }
        }
      });
    };
  }, [audioQueue]);

  return (
    <div {...getRootProps()} className={`relative transition-colors ${isDragActive ? 'bg-blue-100 dark:bg-blue-900/30' : ''}`}>
      <input {...getInputProps()} />
      
      {isDragActive && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-blue-500/20 border-2 border-dashed border-blue-600 rounded-lg">
          <p className="text-blue-800 dark:text-blue-200 font-semibold">Drop audio files here</p>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Add Audio Sources</CardTitle>
          <CardDescription>Add local files or YouTube links to the transcription queue.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="youtube">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="youtube">YouTube</TabsTrigger>
              <TabsTrigger value="local">Local Files</TabsTrigger>
            </TabsList>
            <TabsContent value="local">
              <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors" onClick={() => document.getElementById('local-file-input')?.click()}>
                <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
                <p className="mb-1 text-sm text-muted-foreground">
                  <span className="font-semibold">Click to upload</span> or drag and drop audio files
                </p>
                <p className="text-xs text-muted-foreground">Supports MP3, WAV, M4A, etc.</p>
                <input id="local-file-input" {...getInputProps()} className="sr-only" />
              </div>
            </TabsContent>
            <TabsContent value="youtube">
              <YoutubeInput
                onVideoExtract={(url) => handleSingleVideoSubmit(url)} 
                onPlaylistExtract={handlePlaylistSubmit} 
              />
              <div className="mt-4">
                 <AudioQualitySelector 
                   value={selectedQuality} 
                   onChange={setSelectedQuality} 
                 />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Resubmit Helper */}
      {resubmitInfo && (
        <Card className="mb-6 border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700">
              <RotateCcw className="h-5 w-5" />
              Batch Resubmission Helper
            </CardTitle>
            <CardDescription>
              You're resubmitting batch job {resubmitInfo.jobId.slice(0, 8)}... Please upload these {resubmitInfo.files.length} files:
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {resubmitInfo.files.map((file, index) => {
                const isUploaded = audioQueue.some(item => item.name === file.filename);
                return (
                  <div key={index} className={`flex items-center justify-between p-2 rounded border ${isUploaded ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex items-center gap-2">
                      {isUploaded ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <Clock className="h-4 w-4 text-gray-500" />
                      )}
                      <span className="font-mono text-sm">{file.filename}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  localStorage.removeItem('resubmitFileList');
                  setResubmitInfo(null);
                }}
              >
                Clear Helper
              </Button>
              {resubmitInfo.files.every(file => 
                audioQueue.some(item => item.name === file.filename)
              ) && (
                <div className="text-sm text-green-600 font-medium">
                  ✓ All files uploaded! You can now submit the batch.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Transcription Queue</CardTitle>
            <CardDescription>Manage and reorder the {audioQueue.length} items before processing.</CardDescription>
          </div>
          {audioQueue.length > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setShowClearConfirm(true)}>
              <Trash className="mr-1 h-4 w-4"/> Clear All
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {audioQueue.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">The queue is empty. Add files or YouTube links above.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={audioQueue.map(item => item.id)} strategy={verticalListSortingStrategy}>
                {audioQueue.map((item) => (
                  <SortableQueueItem
                    key={item.id}
                    item={item}
                    getSourceLabel={getSourceLabel}
                    formatDuration={formatDuration}
                    formatExtractionCompletionTime={formatExtractionCompletionTime}
                    individualProgress={individualProgressMap ? individualProgressMap[item.id] : undefined}
                    onReprocessItem={onReprocessItem}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently remove all items from the transcription queue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearQueue} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-white">
              Clear Queue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 