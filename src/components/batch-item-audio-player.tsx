import { useState, useRef, useEffect, useCallback } from "react"
import { Play, Pause } from "lucide-react"
import { Slider } from "@/components/ui/slider"
import { formatTime } from "@/utils/time-utils"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface BatchItemAudioPlayerProps {
  audioUrl: string
  audioFileName: string
}

export function BatchItemAudioPlayer({ 
  audioUrl, 
  audioFileName
}: BatchItemAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [currentAudioUrl, setCurrentAudioUrl] = useState(audioUrl)
  
  // Reset state when audio URL changes
  useEffect(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setIsLoading(true)
    setHasError(false)
    setCurrentAudioUrl(audioUrl)
  }, [audioUrl])

  // Audio element event handlers
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      if (!isNaN(audio.currentTime) && isFinite(audio.currentTime)) {
        setCurrentTime(audio.currentTime)
      }
    }
    
    const handleDurationChange = () => {
      if (!isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration)
        setIsLoading(false)
      }
    }
    
    const handleLoadedMetadata = () => {
      setIsLoading(false)
      setHasError(false)
    }
    
    const handleEnded = () => setIsPlaying(false)
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    
    const handleError = () => {
      console.error("Audio error for:", audioFileName)
      setIsLoading(false)
      setHasError(true)
      toast.error("Error loading audio", { id: `audio-error-${audioFileName}` })
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('error', handleError)
    }
  }, [currentAudioUrl, audioFileName])

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        if (audioRef.current.currentTime >= audioRef.current.duration) {
          audioRef.current.currentTime = 0
        }
        audioRef.current.play().catch(error => {
          console.error("Play error:", error)
          setHasError(true)
          toast.error("Failed to play audio")
        })
      }
      setIsPlaying(!isPlaying)
    }
  }

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current
    if (!audio) return
    
    const newTime = value[0]
    if (!isNaN(newTime) && isFinite(newTime) && newTime >= 0) {
      audio.currentTime = newTime
      setCurrentTime(newTime)
    }
  }

  return (
    <div className="flex flex-col space-y-1 w-full">
      <audio 
        ref={audioRef} 
        src={currentAudioUrl} 
        preload="metadata" 
      />
      
      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          size="sm"
          className="h-6 w-6 p-0"
          disabled={isLoading || hasError}
          onClick={handlePlayPause}
        >
          {isPlaying ? (
            <Pause className="h-3 w-3" />
          ) : (
            <Play className="h-3 w-3" />
          )}
        </Button>
        
        <div className="relative flex-1 h-6 flex items-center">
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={0.1}
            onValueChange={handleSeek}
            disabled={isLoading || hasError || duration === 0}
            aria-label="Seek time"
            className="cursor-pointer h-1"
          />
        </div>
        
        <div className="text-xs text-muted-foreground">
          {isLoading ? "--:--" : formatTime(currentTime)} / {isLoading ? "--:--" : formatTime(duration)}
        </div>
      </div>
    </div>
  )
} 