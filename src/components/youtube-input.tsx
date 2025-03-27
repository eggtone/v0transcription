import { useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { MP3Quality, DEFAULT_MP3_QUALITY } from "@/utils/audio-utils";

interface YoutubeInputProps {
  onVideoExtract: (url: string, videoId: string, quality: MP3Quality) => Promise<void>;
  onPlaylistExtract: (url: string, playlistId: string, quality: MP3Quality) => Promise<void>;
  disabled?: boolean;
}

export function YoutubeInput({ onVideoExtract, onPlaylistExtract, disabled = false }: YoutubeInputProps) {
  const [url, setUrl] = useState<string>("");
  const [extracting, setExtracting] = useState<boolean>(false);
  const [selectedQuality] = useState<MP3Quality>(DEFAULT_MP3_QUALITY);

  // Function to validate and extract YouTube video ID
  const extractVideoId = (url: string): string | null => {
    // Regular YouTube URL: https://www.youtube.com/watch?v=VIDEO_ID
    const regularMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\?/]+)/);
    if (regularMatch) return regularMatch[1];
    
    // YouTube Shorts: https://www.youtube.com/shorts/VIDEO_ID
    const shortsMatch = url.match(/youtube\.com\/shorts\/([^&\?/]+)/);
    if (shortsMatch) return shortsMatch[1];
    
    return null;
  };

  // Function to extract playlist ID
  const extractPlaylistId = (url: string): string | null => {
    const match = url.match(/(?:youtube\.com\/playlist\?list=)([^&\?/]+)/);
    return match ? match[1] : null;
  };

  // Function to check if URL contains both video and playlist
  const isVideoInPlaylist = (url: string): { videoId: string, playlistId: string } | null => {
    const match = url.match(/youtube\.com\/watch\?v=([^&\?/]+).*?list=([^&\?/]+)/);
    return match ? { videoId: match[1], playlistId: match[2] } : null;
  };

  const handleExtract = async () => {
    if (!url.trim()) {
      toast.error("Please enter a YouTube URL");
      return;
    }

    setExtracting(true);
    try {
      // Check for playlist with video
      const videoInPlaylist = isVideoInPlaylist(url);
      if (videoInPlaylist) {
        // Ask user if they want just this video or the whole playlist
        if (window.confirm("This URL contains both a video and a playlist. Do you want to extract the entire playlist?\n\nClick 'OK' for the entire playlist, or 'Cancel' for just this video.")) {
          await onPlaylistExtract(url, videoInPlaylist.playlistId, selectedQuality);
        } else {
          await onVideoExtract(url, videoInPlaylist.videoId, selectedQuality);
        }
        setUrl("");
        return;
      }

      // Check for playlist URL
      const playlistId = extractPlaylistId(url);
      if (playlistId) {
        await onPlaylistExtract(url, playlistId, selectedQuality);
        setUrl("");
        return;
      }

      // Regular video URL
      const videoId = extractVideoId(url);
      if (videoId) {
        await onVideoExtract(url, videoId, selectedQuality);
        setUrl("");
        return;
      }

      // Not a valid YouTube URL
      toast.error("Invalid YouTube URL. Please enter a valid YouTube video or playlist URL.");
      
    } catch (error) {
      console.error("Error extracting YouTube audio:", error);
      toast.error(`Failed to extract audio: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex w-full gap-2">
        <Input
          className="flex-1"
          type="text"
          placeholder="Enter YouTube video or playlist URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={disabled || extracting}
        />
        <Button disabled={disabled || extracting || !url.trim()} onClick={handleExtract}>
          {extracting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Extracting...
            </>
          ) : (
            "Add to Queue"
          )}
        </Button>
      </div>
      <div className="text-xs text-muted-foreground">
        Supports YouTube video links, shorts, and playlists. For videos in playlists, you'll be asked if you want to extract the entire playlist.
      </div>
    </div>
  );
} 