import { useState, useRef, useEffect, useCallback } from "react"
import { Play, Pause, Volume2, VolumeX, RotateCcw } from "lucide-react"
import { Slider } from "@/components/ui/slider"
import { formatTime } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface AudioPlayerProps {
  audioUrl: string
  audioFileName: string
  mini?: boolean
  onRefreshUrl?: () => Promise<string>
}

export function AudioPlayer({ 
  audioUrl, 
  audioFileName, 
  mini = false,
  onRefreshUrl
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [errorType, setErrorType] = useState<'blob' | 'network' | 'format' | 'unknown'>('unknown')
  const [retryCount, setRetryCount] = useState(0)
  const [currentAudioUrl, setCurrentAudioUrl] = useState(audioUrl)
  
  // Add a ref to track the last time we refreshed the URL to prevent excessive refreshes
  const lastRefreshTimeRef = useRef<number>(0)
  const isRetryingRef = useRef<boolean>(false)
  const MAX_RETRIES = 3

  // Define handleRetry with useCallback to avoid dependency issues
  const handleRetry = useCallback(async () => {
    // Check if we're already retrying to prevent multiple simultaneous retries
    if (isRetryingRef.current) {
      console.log("Retry already in progress, skipping");
      return;
    }
    
    // Check if we've exceeded the retry count
    if (retryCount >= MAX_RETRIES) {
      console.log(`Already retried ${retryCount} times, not retrying again`);
      return;
    }
    
    // Check if we've refreshed recently (within the last 3 seconds)
    const now = Date.now();
    if (now - lastRefreshTimeRef.current < 3000) {
      console.log("Recently refreshed, waiting before trying again");
      return;
    }
    
    isRetryingRef.current = true;
    setIsLoading(true);
    setHasError(false);
    
    try {
      // If this is a blob URL and we have a refresh callback, try to refresh the URL
      if (errorType === 'blob' && onRefreshUrl) {
        // Don't show toast for every retry to avoid flooding the user
        if (retryCount === 0) {
          toast.info("Refreshing audio URL...");
        }
        
        const newUrl = await onRefreshUrl();
        lastRefreshTimeRef.current = Date.now();
        
        if (newUrl && newUrl !== currentAudioUrl) {
          console.log("Refreshed URL from:", currentAudioUrl, "to:", newUrl);
          setCurrentAudioUrl(newUrl);
          setRetryCount(prev => prev + 1);
          isRetryingRef.current = false;
          return; // Return early as we'll re-initialize with the new URL
        }
      }
      
      // Otherwise just retry with current URL
      if (audioRef.current) {
        setRetryCount(prev => prev + 1);
        
        // Force reload the audio element
        audioRef.current.load();
        
        if (retryCount === 0) {
          toast.info("Attempting to reload audio...");
        }
        
        // Add a small delay before attempting to play
        setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.play().catch(error => {
              console.error("Retry play error:", error);
              setHasError(true);
              setIsLoading(false);
              isRetryingRef.current = false;
              
              // Provide specific error message based on the error type
              if (error instanceof DOMException) {
                if (error.name === "NotSupportedError") {
                  setErrorType('format');
                  toast.error("Audio format not supported by your browser.");
                } else if (error.name === "NotAllowedError") {
                  toast.error("Playback not allowed. Try interacting with the page first.");
                } else {
                  toast.error("Unable to play audio: " + error.message);
                }
              } else {
                toast.error("Still unable to load audio. Please check the source.");
              }
            });
          }
          isRetryingRef.current = false;
        }, 1000);
      }
    } catch (error) {
      console.error("Error in retry handler:", error);
      setHasError(true);
      setIsLoading(false);
      isRetryingRef.current = false;
      toast.error("Failed to retry audio playback.");
    }
  }, [errorType, onRefreshUrl, currentAudioUrl, retryCount]);

  // Auto-retry for blob URL errors with debounce to prevent excessive retries
  useEffect(() => {
    // When we detect a blob error and we have a refresh callback, auto-retry
    if (hasError && errorType === 'blob' && onRefreshUrl && retryCount < MAX_RETRIES) {
      console.log(`Auto-retrying blob URL refresh (attempt ${retryCount + 1})`);
      
      // Use a delay that increases with each retry attempt
      const retryDelay = 500 + (retryCount * 500); // 500ms, 1000ms, 1500ms...
      
      const retryTimeout = setTimeout(() => {
        handleRetry();
      }, retryDelay);
      
      return () => clearTimeout(retryTimeout);
    }
  }, [hasError, errorType, onRefreshUrl, handleRetry, retryCount]);

  // Reset state when audio URL changes
  useEffect(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setIsLoading(true)
    setHasError(false)
    setErrorType('unknown')
    setRetryCount(0)
    setCurrentAudioUrl(audioUrl)
    isRetryingRef.current = false
  }, [audioUrl])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    // Validate time values to ensure they're reasonable
    const isValidTime = (time: number) => {
      return !isNaN(time) && isFinite(time) && time >= 0 && time < 86400; // Max 24 hours
    };

    const updateTime = () => {
      if (isValidTime(audio.currentTime)) {
        setCurrentTime(audio.currentTime);
      }
    };
    
    const updateDuration = () => {
      if (isValidTime(audio.duration)) {
        setDuration(audio.duration);
        setIsLoading(false);
      } else {
        console.warn("Invalid audio duration:", audio.duration);
        
        // Try to get duration by seeking to the end and checking currentTime
        const currentPos = audio.currentTime;
        
        // Try to determine duration by loading metadata
        setTimeout(() => {
          // If we still don't have a valid duration, set a reasonable default
          if (!isValidTime(audio.duration)) {
            // For YouTube extracted audio, try to parse duration from filename or use default
            const match = audioFileName.match(/Duration: (\d+):(\d+)/);
            if (match) {
              const minutes = parseInt(match[1]);
              const seconds = parseInt(match[2]);
              setDuration(minutes * 60 + seconds);
            } else {
              // Check if the duration is in the audio filename with format "duration-5:55"
              const durationMatch = audioFileName.match(/duration[- _](\d+):(\d+)/i);
              if (durationMatch) {
                const minutes = parseInt(durationMatch[1]);
                const seconds = parseInt(durationMatch[2]);
                setDuration(minutes * 60 + seconds);
              } else {
                // If we know it's a YouTube video by URL pattern, try to estimate duration from transcription data
                const ytMatch = currentAudioUrl.includes('/api/youtube/audio/');
                if (ytMatch) {
                  // For YouTube videos, use a longer default duration as they're usually longer than 30 seconds
                  // Use 10 minutes as default for YouTube content since most content is at least a few minutes
                  console.log("YouTube audio detected, using extended default duration");
                  setDuration(600); // 10 minutes (600 seconds)
                } else {
                  // Default to 30 seconds if we can't determine duration
                  setDuration(30);
                }
              }
            }
          }
          
          // Restore original position
          audio.currentTime = currentPos;
          setIsLoading(false);
        }, 300);
      }
    };
    
    const handleEnded = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    
    const handleLoadedMetadata = () => {
      updateDuration();
      setIsLoading(false);
      setHasError(false);
    };
    
    const handleError = (e: Event) => {
      console.error("Audio error:", e);
      setIsLoading(false);
      setHasError(true);
      
      // Determine error type for better error messages
      if (currentAudioUrl.startsWith('blob:')) {
        setErrorType('blob');
        console.log("Blob URL error detected for:", currentAudioUrl);
        
        // Don't show toast for blob errors as we'll auto-retry
        if (onRefreshUrl) {
          // We'll auto-retry in useEffect, not here
          console.log("Will auto-retry blob URL refresh");
        } else {
          toast.error("The audio URL has expired and cannot be refreshed automatically.");
        }
      } else if ((e.target as HTMLAudioElement).error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        setErrorType('format');
        toast.error("Audio format not supported by your browser.");
      } else if ((e.target as HTMLAudioElement).error?.code === MediaError.MEDIA_ERR_NETWORK) {
        setErrorType('network');
        toast.error("Network error when loading audio. Check your connection.");
      } else {
        setErrorType('unknown');
        toast.error("Failed to load audio. Please try again.");
      }
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('durationchange', updateDuration);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('error', handleError);

    // Try to load the audio
    audio.load();

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('durationchange', updateDuration);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('error', handleError);
    };
  }, [currentAudioUrl, audioFileName, errorType, onRefreshUrl]);

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        // If we've reached the end, start from beginning
        if (audioRef.current.currentTime >= audioRef.current.duration) {
          audioRef.current.currentTime = 0;
        }
        audioRef.current.play().catch(error => {
          console.error("Play error:", error);
          toast.error("Failed to play audio. Please try again.");
          setHasError(true);
          
          // Check error type for better error handling
          if (error.name === "NotSupportedError") {
            setErrorType('format');
          } else if (error.name === "NotAllowedError") {
            toast.error("Playback not allowed. Try interacting with the page first.");
          }
        });
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current
    if (!audio) return
    
    const newTime = value[0]
    if (!isNaN(newTime) && isFinite(newTime) && newTime >= 0) {
      audio.currentTime = newTime
      setCurrentTime(newTime)
      
      // If audio was playing and we're seeking, ensure it continues playing
      if (isPlaying && audio.paused) {
        audio.play().catch(error => {
          console.error("Error resuming playback after seek:", error)
        })
      }
    }
  }

  const handleVolumeChange = (value: number[]) => {
    const audio = audioRef.current
    if (!audio) return
    
    const newVolume = value[0]
    
    // Ensure volume is between 0 and 1
    const clampedVolume = Math.max(0, Math.min(1, newVolume))
    
    // Update state
    setVolume(clampedVolume)
    
    // Update audio element
    audio.volume = clampedVolume
    
    // Update mute state based on volume
    if (clampedVolume === 0) {
      setIsMuted(true)
    } else if (isMuted) {
      setIsMuted(false)
    }
  }

  const toggleMute = () => {
    const audio = audioRef.current
    if (!audio) return
    
    if (isMuted) {
      // Restore previous volume, but ensure it's not 0
      const previousVolume = volume === 0 ? 0.5 : volume
      audio.volume = previousVolume
      setVolume(previousVolume)
      setIsMuted(false)
    } else {
      // Store current volume before muting
      if (audio.volume > 0) {
        setVolume(audio.volume)
      }
      audio.volume = 0
      setIsMuted(true)
    }
  }

  return (
    <div className="flex flex-col space-y-2 w-full">
      <audio 
        ref={audioRef} 
        src={currentAudioUrl} 
        preload="metadata" 
        key={`${currentAudioUrl}-${retryCount}`}
      />
      
      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={isLoading || hasError}
          onClick={handlePlayPause}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
        
        <div className="relative flex-1 h-8 flex items-center">
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={0.1}
            onValueChange={handleSeek}
            onValueCommit={handleSeek}
            disabled={isLoading || hasError || duration === 0}
            aria-label="Seek time"
            className="cursor-pointer hover:cursor-grab active:cursor-grabbing"
          />
          
          {/* Progress indicator */}
          <div 
            className="absolute h-1 bg-primary rounded-full pointer-events-none" 
            style={{ 
              width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
              left: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 0
            }}
          />
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={isLoading || hasError}
            onClick={toggleMute}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
          
          <div className="w-20 h-8 flex items-center">
            <Slider
              value={[isMuted ? 0 : volume]}
              max={1}
              step={0.01}
              onValueChange={handleVolumeChange}
              disabled={isLoading || hasError}
              aria-label="Volume"
              className="cursor-pointer hover:cursor-grab active:cursor-grabbing"
            />
          </div>
        </div>
      </div>
      
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div>
          {isLoading ? "--:--" : formatTime(currentTime)}
        </div>
        <div className="flex items-center space-x-2">
          {hasError && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRetry}
              className="text-xs py-1 h-7"
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Retry
            </Button>
          )}
          <div>
            {isLoading ? "--:--" : formatTime(duration)}
            {hasError && (
              <span className="text-red-500 ml-2">
                (Error {errorType === 'blob' ? 'expired URL' : 'loading audio'})
              </span>
            )}
          </div>
        </div>
      </div>
      
      {hasError && (
        <div className="text-xs text-red-500 text-center mt-1">
          {errorType === 'blob' 
            ? "Audio URL has expired. Please use the 'Retry' button or try reprocessing the item."
            : errorType === 'format'
            ? "Audio format not supported by your browser."
            : errorType === 'network'
            ? "Network error loading audio. Check your connection."
            : "Unable to load audio. Please check the source or try again."
          }
        </div>
      )}
    </div>
  )
} 