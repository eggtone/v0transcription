import { useState, useRef } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { MP3Quality, DEFAULT_MP3_QUALITY } from "@/lib/audio-utils";
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

interface YoutubeInputProps {
  onVideoExtract: (url: string, videoId: string, quality: MP3Quality) => Promise<void>;
  onPlaylistExtract: (url: string, playlistId: string, quality: MP3Quality) => Promise<void>;
  disabled?: boolean;
}

export function YoutubeInput({ onVideoExtract, onPlaylistExtract, disabled = false }: YoutubeInputProps) {
  const [url, setUrl] = useState<string>("");
  const [selectedQuality] = useState<MP3Quality>(DEFAULT_MP3_QUALITY);
  
  // State for the playlist confirmation dialog
  const [showPlaylistDialog, setShowPlaylistDialog] = useState(false);
  const playlistDataRef = useRef<{ url: string, videoId: string, playlistId: string } | null>(null);

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

  // Handle extracting entire playlist
  const handleExtractPlaylist = async () => {
    if (playlistDataRef.current) {
      try {
        await onPlaylistExtract(
          playlistDataRef.current.url, 
          playlistDataRef.current.playlistId, 
          selectedQuality
        );
        setUrl("");
      } catch (error) {
        console.error("Error extracting playlist:", error);
        toast.error(`Failed to extract playlist: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
    setShowPlaylistDialog(false);
  };

  // Handle extracting just the current video
  const handleExtractSingleVideo = async () => {
    if (playlistDataRef.current) {
      try {
        await onVideoExtract(
          playlistDataRef.current.url, 
          playlistDataRef.current.videoId, 
          selectedQuality
        );
        setUrl("");
      } catch (error) {
        console.error("Error extracting video:", error);
        toast.error(`Failed to extract video: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
    setShowPlaylistDialog(false);
  };

  const handleExtract = async () => {
    if (!url.trim()) {
      toast.error("Please enter a YouTube URL");
      return;
    }

    try {
      // Check for playlist with video
      const videoInPlaylist = isVideoInPlaylist(url);
      if (videoInPlaylist) {
        // Store the data and show the confirmation dialog
        playlistDataRef.current = {
          url,
          videoId: videoInPlaylist.videoId,
          playlistId: videoInPlaylist.playlistId
        };
        setShowPlaylistDialog(true);
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
    }
  };

  return (
    <>
      <div className="flex w-full flex-col gap-2">
        <div className="flex w-full gap-2">
          <Input
            className="flex-1"
            type="text"
            placeholder="Enter YouTube video or playlist URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={disabled}
          />
          <Button disabled={disabled || !url.trim()} onClick={handleExtract}>
            Add to Queue
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          Supports YouTube video links, shorts, and playlists. For videos in playlists, you'll be asked if you want to extract the entire playlist.
        </div>
      </div>

      {/* Playlist confirmation dialog */}
      <AlertDialog open={showPlaylistDialog} onOpenChange={(open) => {
        setShowPlaylistDialog(open);
      }}>
        <AlertDialogContent className="max-w-md w-full p-4 sm:p-6">
          <AlertDialogHeader className="pb-2">
            <AlertDialogTitle>Playlist Detected</AlertDialogTitle>
            <AlertDialogDescription className="text-sm pt-2">
              This URL contains both a video and a playlist. Do you want to extract the entire playlist or just this single video?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-4">
            <AlertDialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <AlertDialogCancel className="mt-0" onClick={() => {
                setShowPlaylistDialog(false);
              }}>
                Cancel
              </AlertDialogCancel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                <AlertDialogAction onClick={handleExtractSingleVideo} className="mt-0">
                  Extract Single Video
                </AlertDialogAction>
                <AlertDialogAction onClick={handleExtractPlaylist} className="mt-0">
                  Extract Entire Playlist
                </AlertDialogAction>
              </div>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
} 