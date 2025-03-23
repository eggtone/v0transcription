"use client"

import React, { useState, useRef, useEffect } from "react"
import { Upload, Play, FileText, ScrollText, Headphones } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { DetailedTranscription } from "@/types"
import { TranscriptionDisplay } from "./transcription-display"
import { TranscriptionSummarization } from "./transcription-summarization"
import { FloatingPlayer } from "./floating-player"
import { SectionNav } from "./ui/section-nav"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { extractYouTubeAudio, isValidYouTubeUrl } from "@/services/youtube"

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
  } | null>(null)
  const [audioFileName, setAudioFileName] = useState<string>("")

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
      setAudioFile(file)
      setAudioFileName(file.name)
      
      // Revoke previous URL if exists
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
      
      // Create new URL
      const url = URL.createObjectURL(file)
      setAudioUrl(url)
      
      // Reset all relevant state
      setTranscriptionData(null)
      setFormattedTranscriptionText("")
      setIsTranscribing(false)
      setError(null)
      
      // Reset YouTube state
      setYoutubeVideoInfo(null)
      setYoutubeError(null)
      setIsExtracting(false)
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
    
    try {
      // First reset transcription-related state
      setTranscriptionData(null)
      setFormattedTranscriptionText("")
      setIsTranscribing(false)
      setError(null)
      
      // Extract audio from YouTube URL
      const response = await fetch("/api/youtube/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: youtubeUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to extract audio from YouTube video");
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      // Set the video info
      setYoutubeVideoInfo(data.videoInfo)
      
      // Set the audio URL and filename
      setAudioUrl(data.videoInfo.audioUrl)
      // Include duration in the filename for the audio player to detect
      setAudioFileName(`${data.videoInfo.title} (duration-${data.videoInfo.duration})`)
      
      // Reset the audio file since we're using a direct URL
      setAudioFile(null)
      
      // Scroll to the audio player section
      document.getElementById('player-section')?.scrollIntoView({ behavior: 'smooth' });
      
    } catch (err) {
      console.error("YouTube extraction error:", err)
      setYoutubeError(`Error: ${err instanceof Error ? err.message : "Unknown error occurred"}`)
    } finally {
      setIsExtracting(false)
    }
  }

  const handleTranscribe = async () => {
    if (!audioUrl) {
      setError("Please select an audio file or extract from YouTube first")
      return
    }

    setIsTranscribing(true)
    setError(null)
    setElapsedTime(0)
    setProcessingTime(null)
    
    // Start the timer
    const startTime = Date.now()
    timerIntervalRef.current = setInterval(() => {
      const currentElapsed = Math.floor((Date.now() - startTime) / 1000)
      setElapsedTime(currentElapsed)
    }, 1000)

    try {
      // For YouTube extracted audio, we need to download it first
      if (youtubeVideoInfo && !audioFile) {
        // Create a FormData object to send the YouTube audio URL
        const formData = new FormData()
        formData.append("youtubeAudioUrl", youtubeVideoInfo.audioUrl)
        formData.append("title", youtubeVideoInfo.title)
        formData.append("model", model)

        // Make a request to our YouTube transcription API endpoint
        const response = await fetch("/api/transcribe/youtube", {
          method: "POST",
          body: formData,
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || "Failed to transcribe YouTube audio")
        }

        const data = await response.json()
        setTranscriptionData(data.transcription)
        
        if (data.transcription && data.transcription.text) {
          setFormattedTranscriptionText(data.transcription.text)
        }
        
        // Display GPU usage information if available
        if (data.transcription.processingTime) {
          const minutes = Math.floor(data.transcription.processingTime / 60)
          const seconds = Math.floor(data.transcription.processingTime % 60)
          const deviceType = data.transcription.usedGpu ? 'GPU' : 'CPU'
          setProcessingTime(`Processed in ${minutes} min ${seconds} seconds using ${deviceType}`)
        }
      } else if (audioFile) {
        // Regular file upload transcription
        const formData = new FormData()
        formData.append("file", audioFile)
        formData.append("model", model)

        // Make a request to our local API endpoint
        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || "Failed to transcribe audio")
        }

        const data = await response.json()
        setTranscriptionData(data.transcription)
        
        if (data.transcription && data.transcription.text) {
          setFormattedTranscriptionText(data.transcription.text)
        }
        
        // Display GPU usage information if available
        if (data.transcription.processingTime) {
          const minutes = Math.floor(data.transcription.processingTime / 60)
          const seconds = Math.floor(data.transcription.processingTime % 60)
          const deviceType = data.transcription.usedGpu ? 'GPU' : 'CPU'
          setProcessingTime(`Processed in ${minutes} min ${seconds} seconds using ${deviceType}`)
        }
      } else {
        throw new Error("No audio source available")
      }
      
    } catch (err) {
      console.error("Transcription error:", err)
      setError(`Error: ${err instanceof Error ? err.message : "Unknown error occurred"}`)
    } finally {
      // Clear the timer interval
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
      setIsTranscribing(false)
    }
  }

  // Format elapsed time for display
  const formatElapsedTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `Processing: ${minutes} min ${seconds} seconds...`
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
                      <div>
                        <h3 className="font-medium">{youtubeVideoInfo.title}</h3>
                        <p className="text-sm text-muted-foreground">Duration: {youtubeVideoInfo.duration}</p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-2"
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
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </section>

      {/* Audio Player Section */}
      {audioUrl && (
        <section id="player-section" className="scroll-mt-16">
          <FloatingPlayer audioUrl={audioUrl} audioFileName={audioFileName} />
        </section>
      )}

      {/* Transcribe Audio Section */}
      {audioUrl && (
        <section id="transcribe-section" className="scroll-mt-16">
          <Card className="w-full max-w-3xl mx-auto">
            <CardHeader>
              <CardTitle>Transcribe Audio</CardTitle>
              <CardDescription>Choose a model and transcribe your audio</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="model">Select Transcription Model</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger id="model">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Local Models - CPU (Reliable)</SelectLabel>
                      <SelectItem value="whisper-tiny">Whisper Tiny (Fast)</SelectItem>
                      <SelectItem value="whisper-base">Whisper Base</SelectItem>
                      <SelectItem value="whisper-small">Whisper Small</SelectItem>
                      <SelectItem value="whisper-medium">Whisper Medium</SelectItem>
                    </SelectGroup>
                    
                    <SelectGroup>
                      <SelectLabel>Local Models - GPU (Experimental)</SelectLabel>
                      <SelectItem value="whisper-tiny-gpu">Whisper Tiny - GPU</SelectItem>
                      <SelectItem value="whisper-base-gpu">Whisper Base - GPU</SelectItem>
                      <SelectItem value="whisper-small-gpu">Whisper Small - GPU</SelectItem>
                      <SelectItem value="whisper-medium-gpu">Whisper Medium - GPU</SelectItem>
                    </SelectGroup>
                    
                    <SelectGroup>
                      <SelectLabel>Cloud Models (Groq API)</SelectLabel>
                      <SelectItem value="groq-distill-whisper">Distill Whisper - English Only</SelectItem>
                      <SelectItem value="groq-whisper-large-v3">Whisper Large v3 - Multilingual</SelectItem>
                      <SelectItem value="groq-whisper-large">Whisper Large - Best Quality</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleTranscribe} disabled={isTranscribing} className="w-full">
                {isTranscribing ? "Transcribing..." : "Transcribe"}
              </Button>
              
              {/* Timer display */}
              {(isTranscribing || processingTime) && (
                <div className="text-center text-sm text-gray-500 mt-2">
                  {isTranscribing ? formatElapsedTime(elapsedTime) : processingTime}
                </div>
              )}
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

