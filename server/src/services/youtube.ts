/**
 * Service for extracting audio from YouTube videos
 */
import { MP3Quality, DEFAULT_MP3_QUALITY } from '@server/lib/audio-utils';

export interface YouTubeVideoInfo {
  title: string;
  audioUrl: string;
  thumbnailUrl: string;
  duration: string;
  fileSize?: number; // Add file size for download progress tracking
  extractionTime: number;
}

/**
 * Extract audio from a YouTube video URL
 * @param youtubeUrl The YouTube URL to extract audio from
 * @param onProgress Optional callback for progress updates
 * @param quality Optional audio quality setting (defaults to DEFAULT_MP3_QUALITY)
 */
export async function extractYouTubeAudio(
  youtubeUrl: string, 
  onProgress?: (progress: { elapsed: number }) => void,
  quality: MP3Quality = DEFAULT_MP3_QUALITY
): Promise<YouTubeVideoInfo> {
  try {
    // Start timing the extraction
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      if (onProgress) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        onProgress({ elapsed });
      }
    }, 1000);

    // Call our API endpoint
    const response = await fetch("/api/youtube/extract", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        url: youtubeUrl,
        quality: quality 
      }),
    });

    // Clear the progress interval
    clearInterval(progressInterval);
    
    // Calculate final elapsed time
    const totalElapsed = Math.floor((Date.now() - startTime) / 1000);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to extract audio from YouTube video");
    }

    const data = await response.json();
    
    // Add total processing time to the data returned
    return {
      ...data,
      extractionTime: totalElapsed
    };
  } catch (error) {
    console.error("YouTube extraction error:", error);
    throw error;
  }
}

/**
 * Validate if a string is a valid YouTube URL
 */
export function isValidYouTubeUrl(url: string): boolean {
  // More comprehensive validation for YouTube URLs
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/user\/\S+\/\S+\/|youtube\.com\/channel\/\S+\/\S+\/|youtube\.com\/playlist\?list=|youtube\.com\/user\/\S+|youtube\.com\/channel\/\S+)([^&]+)/;
  return youtubeRegex.test(url);
}

/**
 * Extract video ID from a YouTube URL
 */
export function extractVideoId(url: string): string | null {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
}

/**
 * Extract playlist ID from a YouTube URL
 */
export function extractPlaylistId(url: string): string | null {
  const match = url.match(/list=([^&]+)/);
  return match ? match[1] : null;
}

/**
 * Fetch information about a YouTube playlist
 */
export async function fetchPlaylistInfo(playlistId: string) {
  const response = await fetch(`/api/youtube/playlist?id=${playlistId}`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch playlist information");
  }
  
  return response.json();
} 