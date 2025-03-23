"use client"

import React, { useState, useRef, useEffect } from "react"
import { Upload, Play, FileText, ScrollText, Headphones } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { DetailedTranscription, TranscriptionSegment } from "@/types"
import { TranscriptionDisplay } from "./transcription-display"
import { TranscriptionSummarization } from "./transcription-summarization"
import { FloatingPlayer } from "./floating-player"
import { SectionNav } from "./ui/section-nav"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { isValidYouTubeUrl } from "@/services/youtube"
import { AudioSplitter } from "./audio-splitter"
import { AudioPart, formatFileSize, isWithinGroqSizeLimit } from "@/utils/audio-utils"
import { AudioPlayer } from "./audio-player"
import { toast } from "sonner"
import { createSegmentsFromText } from "@/utils"
import { Progress } from "@/components/ui/progress"
import { formatTime, formatExtractionCompletionTime } from "@/utils/time-utils"
import { 
  resetAudioSourceState, 
  processFileUpload, 
  processYoutubeExtraction, 
  AudioSourceState 
} from "@/utils/audio-source-utils"
import { 
  processTranscription, 
  TranscriptionState,
  formatTranscriptionText
} from "@/utils/transcription-utils"
import { processSplitAudioParts } from "@/utils/audio-split-utils"

export default function AudioTranscription() {
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [model, setModel] = useState<string>("whisper-tiny")
  const [transcriptionData, setTranscriptionData] = useState<DetailedTranscription | null>(null)
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [formattedTranscriptionText, setFormattedTranscriptionText] = useState<string>("")
  
  // Timer state for transcription process
  const [elapsedTime, setElapsedTime] = useState<number>(0)
  const [processingTime, setProcessingTime] = useState<string | null>(null)
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  // YouTube extraction state
  const [youtubeUrl, setYoutubeUrl] = useState<string>("")
  const [isExtracting, setIsExtracting] = useState<boolean>(false)
  const [youtubeError, setYoutubeError] = useState<string | null>(null)
  const [youtubeVideoInfo, setYoutubeVideoInfo] = useState<{
    title: string;
    audioUrl: string;
    thumbnailUrl: string;
    duration: string;
    extractionTime?: number;
  } | null>(null)
  const [extractionElapsedTime, setExtractionElapsedTime] = useState<number>(0)
  const [audioFileName, setAudioFileName] = useState<string>("")
  const [extractionProgress, setExtractionProgress] = useState<number>(0)

  // Add new state variables for audio splitting
  const [audioParts, setAudioParts] = useState<AudioPart[]>([]);
  const [currentPartIndex, setCurrentPartIndex] = useState<number>(-1);
  const [transcriptionProgress, setTranscriptionProgress] = useState<number>(0);
  const [isTranscribingParts, setIsTranscribingParts] = useState<boolean>(false);
  const [partResults, setPartResults] = useState<{text: string, processingTime: number}[]>([]);

  // Define section navigation
  const sections = [
    { id: "upload-section", icon: <Upload className="h-5 w-5" />, label: "Upload Audio" },
    { id: "player-section", icon: <Play className="h-5 w-5" />, label: "Audio Player" },
    { id: "transcribe-section", icon: <Headphones className="h-5 w-5" />, label: "Transcribe Audio" },
    { id: "transcription-section", icon: <FileText className="h-5 w-5" />, label: "Transcription" },
    { id: "summary-section", icon: <ScrollText className="h-5 w-5" />, label: "Summary" }
  ]

  // Create object URL for the audio file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      
      // Revoke previous URL if exists
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
      
      // Use the utility function to process the file upload
      const newUrl = processFileUpload(
        file,
        {
          setAudioFile,
          setAudioUrl,
          setAudioFileName,
          setTranscriptionData,
          setFormattedTranscriptionText,
          setIsTranscribing,
          setError,
          setAudioParts
        }
      )
      
      // We don't reset youtubeUrl to allow users to keep their previous URL
    }
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  // Handle YouTube URL extraction
  const handleYoutubeExtract = async () => {
    if (!youtubeUrl.trim()) {
      setYoutubeError("Please enter a YouTube URL")
      return
    }

    if (!isValidYouTubeUrl(youtubeUrl)) {
      setYoutubeError("Please enter a valid YouTube URL")
      return
    }

    setIsExtracting(true)
    setYoutubeError(null)
    setExtractionElapsedTime(0)
    setExtractionProgress(10) // Set initial progress
    
    try {
      // Use the utility function to handle YouTube extraction
      const result = await processYoutubeExtraction(
        youtubeUrl,
        {
          setAudioFile,
          setAudioUrl,
          setAudioFileName,
          setTranscriptionData,
          setFormattedTranscriptionText,
          setIsTranscribing,
          setError,
          setYoutubeVideoInfo,
          setYoutubeError,
          setIsExtracting,
          setAudioParts
        },
        {
          setProgress: setExtractionProgress,
          setElapsedTime: setExtractionElapsedTime
        }
      )
      
      if (result && result.success) {
        // Scroll to the audio player section
        document.getElementById('player-section')?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (err) {
      console.error("YouTube extraction error:", err)
      setYoutubeError(`Error: ${err instanceof Error ? err.message : "Unknown error occurred"}`)
      setExtractionProgress(0) // Reset progress on error
    } finally {
      setIsExtracting(false)
    }
  }

  // Handle splitting of audio file
  const handleSplitComplete = (parts: AudioPart[]) => {
    // Clean up previous parts' URLs if they exist
    audioParts.forEach(part => {
      if (part.url) {
        URL.revokeObjectURL(part.url);
        console.log(`Cleaned up object URL for ${part.name}`);
      }
    });
    
    setAudioParts(parts);
    // If no parts (reset was clicked), we go back to the full audio file
    if (parts.length === 0) {
      setCurrentPartIndex(-1);
      setTranscriptionProgress(0);
      setPartResults([]);
    } else {
      // Scroll to the transcribe section when parts are ready
      const transcribeSection = document.getElementById("transcribe-section");
      if (transcribeSection) {
        transcribeSection.scrollIntoView({ behavior: "smooth" });
      }
      
      // Display a message about the parts being ready
      toast.success(`${parts.length} audio parts ready for transcription`);
      
      // Calculate total size
      const totalSize = parts.reduce((sum, part) => sum + part.size, 0);
      console.log(`All parts ready for transcription. Total size: ${formatFileSize(totalSize)}`);
    }
  };

  // Clean up audio parts URLs when component unmounts or when parts are no longer needed
  useEffect(() => {
    return () => {
      // Clean up all object URLs from audio parts to prevent memory leaks
      audioParts.forEach(part => {
        if (part.url) {
          URL.revokeObjectURL(part.url);
          console.log(`Component cleanup: Released object URL for ${part.name}`);
        }
      });
    };
  }, [audioParts]);

  // Modified handleTranscribe to support split audio parts and show progressive updates
  const handleTranscribe = async () => {
    if (!audioUrl && !audioParts.length) {
      setError("Please select an audio file or extract from YouTube first");
      return;
    }

    // If we have split the audio into parts, transcribe each part in sequence
    if (audioParts.length > 0) {
      // Start the timer
      const startTime = Date.now();
      timerIntervalRef.current = setInterval(() => {
        const currentElapsed = Math.floor((Date.now() - startTime) / 1000);
        setElapsedTime(currentElapsed);
      }, 1000);
      
      try {
        // Create split audio state object
        const splitAudioState = {
          setIsTranscribingParts,
          setIsTranscribing,
          setError,
          setElapsedTime,
          setProcessingTime,
          setTranscriptionData,
          setFormattedTranscriptionText,
          setPartResults,
          setCurrentPartIndex,
          setTranscriptionProgress
        };
        
        // Process split audio parts using the utility function
        const result = await processSplitAudioParts(
          audioParts,
          model,
          splitAudioState
        );
        
        if (result) {
          // Scroll to transcription section
          document.getElementById('transcription-section')?.scrollIntoView({ behavior: 'smooth' });
        }
      } catch (err) {
        console.error("Split audio transcription error:", err);
        setError(`Error: ${err instanceof Error ? err.message : "Unknown error occurred"}`);
        // Keep progress at current level instead of resetting to 0
      } finally {
        // Clear the timer interval
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
      }
    } else {
      // Use the utility function for single file transcription
      
      // Start the timer for all models, including Groq API
      const startTime = Date.now();
      timerIntervalRef.current = setInterval(() => {
        const currentElapsed = Math.floor((Date.now() - startTime) / 1000);
        setElapsedTime(currentElapsed);
      }, 1000);

      try {
        // Create transcription state object
        const transcriptionState: TranscriptionState = {
          setIsTranscribing,
          setTranscriptionData,
          setTranscriptionProgress,
          setFormattedTranscriptionText,
          setError,
          setDeviceType: (type) => {
            // Set processing time with device type
            const minutes = Math.floor(elapsedTime / 60);
            const seconds = elapsedTime % 60;
            const timeMessage = `Processed in ${minutes}m ${seconds}s using ${type}`;
            setProcessingTime(timeMessage);
          },
          setModel
        };

        // Process transcription based on source
        const result = await processTranscription(
          audioFile,
          audioUrl,
          audioFileName,
          audioParts,
          model,
          "en", // default language
          transcriptionState
        );

        if (result) {
          // Scroll to transcription section
          document.getElementById('transcription-section')?.scrollIntoView({ behavior: 'smooth' });
          toast.success("Transcription complete!");
        }
      } catch (error) {
        console.error("Transcription error:", error);
        setError(`Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`);
        // Don't reset progress on error, keep it at current level
      } finally {
        // Clear the timer interval
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
      }
    }
  };

  // Format elapsed time for display - remove this and use the utility function
  const formatElapsedTimeDisplay = (totalSeconds: number) => {
    return formatTime(totalSeconds, true);
  }

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
    }
  }, [])

  // Clean up the URL when component unmounts
  useEffect(() => {
    return () => {
      if (audioUrl && !youtubeVideoInfo) {
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [audioUrl, youtubeVideoInfo])

  // Update formatted text when transcription data changes
  const handleTranscriptionTextUpdate = (text: string) => {
    setFormattedTranscriptionText(text)
  }

  // Show section nav only if we have uploaded a file or extracted from YouTube
  const showSectionNav = audioUrl !== null

  return (
    <div className="space-y-8 pb-16">
      {/* Section Navigation */}
      {showSectionNav && <SectionNav sections={sections} />}

      {/* Upload Audio Section */}
      <section id="upload-section" className="scroll-mt-16">
        <Card className="w-full max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle>Audio Source</CardTitle>
            <CardDescription>Upload an audio file or extract from YouTube</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="upload">
              <TabsList className="w-full">
                <TabsTrigger value="upload" className="flex-1">Upload Audio</TabsTrigger>
                <TabsTrigger value="youtube" className="flex-1">Extract from YouTube</TabsTrigger>
              </TabsList>
              
              {/* Upload Audio Tab */}
              <TabsContent value="upload" className="space-y-4">
                <div className="space-y-2">
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="audio/*" className="hidden" />
                  <Button
                    onClick={handleUploadClick}
                    variant="outline"
                    className="w-full h-32 flex flex-col items-center justify-center border-dashed gap-2"
                  >
                    <Upload className="h-6 w-6" />
                    <span>Upload Audio File</span>
                    {audioFile && <span className="text-sm text-muted-foreground mt-2">Selected: {audioFile.name}</span>}
                  </Button>
                </div>

                {error && (
                  <div className="text-red-500 text-sm p-2 bg-red-50 rounded border border-red-200">
                    {error}
                  </div>
                )}
              </TabsContent>
              
              {/* YouTube Tab */}
              <TabsContent value="youtube" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="youtube-url">YouTube Video URL</Label>
                  <div className="flex gap-2">
                    <Input
                      id="youtube-url"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={youtubeUrl}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setYoutubeUrl(e.target.value)}
                    />
                    <Button 
                      onClick={handleYoutubeExtract} 
                      disabled={isExtracting}
                    >
                      {isExtracting ? "Extracting..." : "Extract Audio"}
                    </Button>
                  </div>
                </div>
                
                {isExtracting && (
                  <div className="flex flex-col space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {formatElapsedTimeDisplay(extractionElapsedTime)}
                    </p>
                    <Progress value={extractionProgress} className="h-2" />
                  </div>
                )}
                
                {youtubeVideoInfo?.extractionTime && !isExtracting && (
                  <p className="text-sm text-muted-foreground">
                    {formatExtractionCompletionTime(youtubeVideoInfo.extractionTime)}
                  </p>
                )}
                
                {youtubeError && (
                  <div className="text-red-500 text-sm p-2 bg-red-50 rounded border border-red-200">
                    {youtubeError}
                  </div>
                )}
                
                {youtubeVideoInfo && (
                  <div className="mt-4 p-4 border rounded-md bg-gray-50">
                    <div className="flex items-start gap-4">
                      <img 
                        src={youtubeVideoInfo.thumbnailUrl} 
                        alt={youtubeVideoInfo.title}
                        className="w-24 h-auto rounded"
                      />
                      <div className="flex-1">
                        <h3 className="font-medium">{youtubeVideoInfo.title}</h3>
                        <p className="text-sm text-muted-foreground">Duration: {youtubeVideoInfo.duration}</p>
                        <div className="mt-2 flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              // Create a temporary anchor element to download the file
                              const a = document.createElement('a')
                              a.href = youtubeVideoInfo.audioUrl
                              a.download = `${youtubeVideoInfo.title}.mp3`
                              document.body.appendChild(a)
                              a.click()
                              document.body.removeChild(a)
                            }}
                          >
                            Download Audio
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>

      {/* Audio Player Section */}
      {audioUrl && (
        <section id="player-section" className={`mt-8 scroll-mt-16 ${audioUrl ? "block" : "hidden"}`}>
          <Card className="w-full max-w-3xl mx-auto">
            <CardHeader>
              <CardTitle>Audio Player</CardTitle>
              <CardDescription>Listen to the audio file before transcription</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold">
                  {audioFileName || "Audio File"}
                </h3>
                {audioFile && (
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${isWithinGroqSizeLimit(audioFile.size) ? 'text-green-500' : 'text-red-500'}`}>
                      {formatFileSize(audioFile.size)}
                    </span>
                    {!isWithinGroqSizeLimit(audioFile.size) && (
                      <span className="text-xs text-red-500">
                        (Over Groq's 20MB limit)
                      </span>
                    )}
                  </div>
                )}
              </div>
              
              <AudioPlayer audioUrl={audioUrl} audioFileName={audioFileName} />
              
              {/* Add the download button */}
              <div className="flex justify-end">
                <a 
                  href={audioUrl}
                  download={audioFileName}
                  className="flex items-center gap-2"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    Download Audio
                  </Button>
                </a>
              </div>
              
              {/* Add audio splitter for files that exceed Groq's limit */}
              {audioFile && !isWithinGroqSizeLimit(audioFile.size) && (
                <div className="mt-6 p-4 border rounded-lg bg-yellow-50">
                  <h3 className="text-base font-medium text-amber-800 mb-2">
                    This audio file exceeds Groq's 20MB limit
                  </h3>
                  <p className="text-sm text-amber-700 mb-4">
                    Please use the splitter below to divide the audio into smaller parts for transcription.
                  </p>
                  <AudioSplitter 
                    audioFile={audioFile}
                    onSplitComplete={handleSplitComplete} 
                  />
                </div>
              )}
              
              {/* Optionally add audio splitter for all files */}
              {audioFile && isWithinGroqSizeLimit(audioFile.size) && (
                <div className="mt-6 p-4 border rounded-lg">
                  <details className="cursor-pointer">
                    <summary className="text-base font-medium">
                      Need to split this audio file?
                    </summary>
                    <div className="mt-4">
                      <p className="text-sm text-muted-foreground mb-4">
                        Even though this file is within size limits, you can still split it into smaller parts if needed.
                      </p>
                      <AudioSplitter 
                        audioFile={audioFile}
                        onSplitComplete={handleSplitComplete} 
                      />
                    </div>
                  </details>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Transcribe Audio Section */}
      {audioUrl && (
        <section id="transcribe-section" className={`mt-8 scroll-mt-16 ${audioUrl ? "block" : "hidden"}`}>
          <Card className="w-full max-w-3xl mx-auto">
            <CardHeader>
              <CardTitle>Transcribe Audio</CardTitle>
              <CardDescription>Process the audio file to generate a text transcription</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label htmlFor="model-select">Transcription Model</Label>
                  <Select
                    value={model}
                    onValueChange={(value) => setModel(value)}
                    disabled={isTranscribing}
                  >
                    <SelectTrigger id="model-select">
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
                        <SelectItem value="groq-distil-whisper">Distill Whisper - English Only (faster)</SelectItem>
                        <SelectItem value="groq-whisper-large-v3">Whisper Large v3 - Multilingual</SelectItem>
                        <SelectItem value="groq-whisper-large">Whisper Large - Best Quality</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {audioParts.length > 0 && (
                <div className="mt-2 bg-green-50 p-3 rounded-md">
                  <p className="text-green-700 text-sm font-medium">
                    Ready to transcribe {audioParts.length} audio parts.
                  </p>
                  <p className="text-green-600 text-xs mt-1">
                    Each part will be processed sequentially and the results will be combined.
                  </p>
                </div>
              )}
              
              <div className="flex flex-col space-y-2">
                <Button
                  onClick={handleTranscribe}
                  disabled={isTranscribing || (!audioUrl && audioParts.length === 0)}
                  className="w-full"
                >
                  {isTranscribing ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {isTranscribingParts 
                        ? `Processing Part ${currentPartIndex + 1} of ${audioParts.length}...` 
                        : "Processing..."}
                    </span>
                  ) : (
                    "Transcribe Audio"
                  )}
                </Button>
                
                {/* Always show the progress bar when transcribing or after completion */}
                {(isTranscribing || transcriptionProgress > 0) && (
                  <div className="flex flex-col space-y-1">
                    {isTranscribingParts ? (
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Part {currentPartIndex + 1}/{audioParts.length} · {formatElapsedTimeDisplay(elapsedTime)}</span>
                          <span>{transcriptionProgress}%</span>
                        </div>
                        <Progress value={transcriptionProgress} className="h-2" />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{isTranscribing ? formatElapsedTimeDisplay(elapsedTime) : "Completed"}</span>
                          <span>{transcriptionProgress}%</span>
                        </div>
                        <Progress value={transcriptionProgress} className="h-2" />
                      </div>
                    )}
                  </div>
                )}
                
                {processingTime && (
                  <p className="text-sm text-muted-foreground">{processingTime}</p>
                )}
                
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Transcription Results Section */}
      {transcriptionData && (
        <section id="transcription-section" className="scroll-mt-16">
          <Card className="w-full max-w-3xl mx-auto">
            <CardHeader>
              <CardTitle>Transcription Results</CardTitle>
              <CardDescription>View and edit the transcription of your audio</CardDescription>
            </CardHeader>
            <CardContent>
              <TranscriptionDisplay 
                transcriptionData={transcriptionData} 
                onTextUpdate={handleTranscriptionTextUpdate}
                audioFileName={audioFileName}
              />
            </CardContent>
          </Card>
        </section>
      )}

      {/* Summarization Section */}
      {transcriptionData && transcriptionData.text && transcriptionData.text.trim() !== "" && (
        <section id="summary-section" className="scroll-mt-16">
          <Card className="w-full max-w-3xl mx-auto">
            <CardHeader>
              <CardTitle>Transcription Summary</CardTitle>
              <CardDescription>Generate a summary of your transcription using AI</CardDescription>
            </CardHeader>
            <CardContent>
              <TranscriptionSummarization 
                transcriptionText={formattedTranscriptionText} 
                isLoading={isTranscribing}
                audioFileName={audioFileName}
              />
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  )
}

