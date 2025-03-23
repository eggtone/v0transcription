import React, { useState, useCallback, useEffect, useRef } from "react";
import { SplitSquareVertical, RefreshCw, Info, FileAudio, AudioLines, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { 
  AudioPart, 
  splitAudioFile, 
  formatFileSize,
  MP3Quality,
  MP3QualityLabels,
  MP3QualityDescriptions
} from "@/utils/audio-utils";
import { formatTime, formatSplitCompletionTime } from "@/utils/time-utils";
import { AudioPlayer } from "./audio-player";
import { useDropzone } from 'react-dropzone';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface AudioSplitterProps {
  audioFile?: File | null;
  onSplitComplete: (parts: AudioPart[]) => void;
}

export function AudioSplitter({ audioFile: externalAudioFile, onSplitComplete }: AudioSplitterProps) {
  const [audioFile, setAudioFile] = useState<File | null>(externalAudioFile || null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [numParts, setNumParts] = useState<number>(3);
  const [audioParts, setAudioParts] = useState<AudioPart[]>([]);
  const [progress, setProgress] = useState(0);
  const [quality, setQuality] = useState<MP3Quality>(MP3Quality.LOW);
  const [expandedPart, setExpandedPart] = useState<number | null>(null);
  const [playingPartIndex, setPlayingPartIndex] = useState<number | null>(null);
  
  // Add timer state for tracking splitting process time
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [splittingTime, setSplittingTime] = useState<string | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update audioFile state when externalAudioFile prop changes
  useEffect(() => {
    if (externalAudioFile) {
      setAudioFile(externalAudioFile);
    }
  }, [externalAudioFile]);
  
  // Clean up object URLs when audioParts change or component unmounts
  useEffect(() => {
    // Create a cleanup function that revokes all URLs
    return () => {
      // Clean up all object URLs to prevent memory leaks
      audioParts.forEach(part => {
        if (part.url) {
          URL.revokeObjectURL(part.url);
          console.log(`Cleaned up object URL for ${part.name}`);
        }
      });
    };
  }, [audioParts]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setAudioFile(acceptedFiles[0]);
      setAudioParts([]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': [],
    },
    maxFiles: 1,
  });

  // Handle number of parts input change
  const handleNumPartsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0) {
      setNumParts(value);
    }
  };

  // Handle slider change for number of parts
  const handleSliderChange = (value: number[]) => {
    setNumParts(value[0]);
  };

  // Handle quality change
  const handleQualityChange = (value: string) => {
    setQuality(parseInt(value) as MP3Quality);
  };

  // Toggle expanded part
  const toggleExpandPart = (index: number) => {
    if (expandedPart === index) {
      setExpandedPart(null);
    } else {
      setExpandedPart(index);
    }
  };

  // Toggle play part
  const togglePlayPart = (index: number) => {
    if (playingPartIndex === index) {
      setPlayingPartIndex(null);
    } else {
      setPlayingPartIndex(index);
    }
  };

  const splitAudio = async () => {
    if (!audioFile) return;

    try {
      setIsProcessing(true);
      setProgress(10); // Start progress
      setElapsedTime(0); // Reset elapsed time
      setSplittingTime(null); // Reset splitting time message
      
      // Start the timer
      const startTime = Date.now();
      timerIntervalRef.current = setInterval(() => {
        const currentElapsed = Math.floor((Date.now() - startTime) / 1000);
        setElapsedTime(currentElapsed);
      }, 1000);
      
      console.log(`Starting audio split with FFmpeg via API. Using quality: ${quality}`);
      
      const parts = await splitAudioFile(audioFile, numParts, quality);
      
      setAudioParts(parts);
      setProgress(100);
      
      // Calculate total time taken
      const totalTime = Math.floor((Date.now() - startTime) / 1000);
      const timeMessage = formatSplitCompletionTime(totalTime);
      setSplittingTime(timeMessage);
      
      onSplitComplete(parts);
      console.log(`Audio split complete. Created ${parts.length} parts in ${formatTime(totalTime)}.`);
      
      // Calculate and log total size
      const totalSize = parts.reduce((sum, part) => sum + part.size, 0);
      console.log(`Total size of all parts: ${formatFileSize(totalSize)}`);
      
      toast.success(`Split complete! Created ${parts.length} audio parts.`);
    } catch (error) {
      console.error('Error splitting audio:', error);
      setProgress(0);
      
      // Check for specific FFmpeg errors
      if (error instanceof Error) {
        if (error.message.includes('FFmpeg')) {
          toast.error(`FFmpeg error: ${error.message}`);
        } else {
          toast.error(`Error splitting audio: ${error.message}`);
        }
      } else {
        toast.error('An unknown error occurred while splitting the audio');
      }
    } finally {
      // Clear the timer interval
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setIsProcessing(false);
    }
  };

  // Reset the split state
  const handleResetClick = () => {
    // Clean up object URLs before clearing the array
    audioParts.forEach(part => {
      if (part.url) {
        URL.revokeObjectURL(part.url);
        console.log(`Cleaned up object URL for ${part.name}`);
      }
    });
    
    setAudioParts([]);
    onSplitComplete([]);
    toast.info("Reset audio parts");
    setSplittingTime(null);
  };

  // Download a part
  const handleDownloadPart = (part: AudioPart) => {
    const a = document.createElement("a");
    a.href = part.url;
    a.download = part.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Get VBR quality description based on selected quality
  const getQualityDescription = (quality: MP3Quality): string => {
    switch (quality) {
      case MP3Quality.HIGH:
        return 'Higher quality, larger file size';
      case MP3Quality.MEDIUM:
        return 'Balanced quality and file size';
      case MP3Quality.LOW:
        return 'Good for speech, smaller file size';
      case MP3Quality.VERY_LOW:
        return 'Lowest quality, smallest file size';
      default:
        return '';
    }
  };

  // Get file size limit warning based on audio file size
  const getFileSizeWarning = () => {
    if (!audioFile) return null;
    
    if (audioFile.size > 20 * 1024 * 1024) {
      return (
        <div className="p-3 mt-2 bg-amber-50 border border-amber-200 rounded-md flex items-start">
          <Info className="h-4 w-4 text-amber-500 mt-0.5 mr-2 flex-shrink-0" />
          <p className="text-sm text-amber-700">
            This audio file exceeds Groq's 20MB limit. Please split it into smaller parts for transcription.
          </p>
        </div>
      );
    }
    return null;
  };

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  // Format time for display - replace with the utility function
  const formatElapsedTimeDisplay = (totalSeconds: number) => {
    return formatTime(totalSeconds, true);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Audio Splitter</CardTitle>
        <CardDescription>
          Split large audio files into smaller parts for easier transcription
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!externalAudioFile ? (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 ${
              isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300'
            }`}
          >
            <input {...getInputProps()} />
            <AudioLines className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Drag & drop an audio file here, or click to select
            </p>
            {audioFile && (
              <p className="mt-2 text-sm font-medium">
                Selected: {audioFile.name} ({formatFileSize(audioFile.size)})
              </p>
            )}
          </div>
        ) : (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex items-center">
              <FileAudio className="h-5 w-5 text-blue-500 mr-2" />
              <p className="text-sm font-medium">
                Using: {audioFile?.name} ({formatFileSize(audioFile?.size || 0)})
              </p>
            </div>
          </div>
        )}

        {audioFile && audioFile.size > 20 * 1024 * 1024 && (
          <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-sm rounded">
            <strong>Note:</strong> This file is over 20MB. For better results with Groq API and
            to avoid timeouts, consider splitting it into more parts.
          </div>
        )}

        {/* Controls for splitting */}
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="num-parts">Number of Parts</Label>
            <div className="flex items-center gap-3">
              <Slider
                id="num-parts-slider"
                value={[numParts]}
                min={2}
                max={20}
                step={1}
                onValueChange={handleSliderChange}
                disabled={isProcessing}
                className="flex-1"
              />
              <Input
                id="num-parts"
                type="number"
                min={1}
                value={numParts}
                onChange={handleNumPartsChange}
                className="w-20"
                disabled={isProcessing}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quality-select">Audio Quality</Label>
            <Select
              value={quality.toString()}
              onValueChange={handleQualityChange}
              disabled={isProcessing}
            >
              <SelectTrigger id="quality-select">
                <SelectValue placeholder="Select quality" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(MP3Quality).filter(v => !isNaN(Number(v))).map((value) => (
                  <SelectItem key={value} value={value.toString()}>
                    {MP3QualityLabels[value as MP3Quality]} - {MP3QualityDescriptions[value as MP3Quality]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Process/Reset buttons */}
          <div className="flex justify-between gap-3">
            <Button
              onClick={splitAudio}
              disabled={!audioFile || isProcessing || audioParts.length > 0}
              className="flex-1"
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <SplitSquareVertical className="h-4 w-4" />
                  Split Audio
                </span>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleResetClick}
              disabled={audioParts.length === 0 || isProcessing}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Reset
            </Button>
          </div>
          
          {/* Display progress during processing */}
          {isProcessing && (
            <div className="space-y-2 mt-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center text-sm text-muted-foreground">
                  <Clock className="mr-2 h-4 w-4" />
                  {formatElapsedTimeDisplay(elapsedTime)}
                </div>
                <span className="text-sm font-medium">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
          
          {/* Display splitting time after completion */}
          {splittingTime && !isProcessing && (
            <div className="text-sm text-muted-foreground flex items-center mt-2">
              <Clock className="mr-2 h-4 w-4" />
              {splittingTime}
            </div>
          )}
        </div>

        {audioParts.length > 0 && (
          <div className="mt-4">
            <h3 className="text-lg font-medium">Audio Parts</h3>
            <div className="space-y-2">
              {audioParts.map((part, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 border rounded"
                >
                  <div className="flex items-center gap-2">
                    <FileAudio className="h-4 w-4" />
                    <span>
                      Part {index + 1} ({formatFileSize(part.size)})
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <audio
                      src={part.url}
                      controls
                      className="h-8 w-48"
                      title={`Part ${index + 1}`}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const a = document.createElement('a');
                        a.href = part.url;
                        a.download = part.name;
                        a.click();
                      }}
                    >
                      Download
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between"></CardFooter>
    </Card>
  );
}

// Helper function to format duration
function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
} 