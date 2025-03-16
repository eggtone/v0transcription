/**
 * Service for extracting audio from YouTube videos
 */

export interface YouTubeVideoInfo {
  title: string;
  audioUrl: string;
  thumbnailUrl: string;
  duration: string;
}

/**
 * Extract audio from a YouTube video URL
 */
export async function extractYouTubeAudio(youtubeUrl: string): Promise<YouTubeVideoInfo> {
  try {
    // Call our API endpoint
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
    return data.videoInfo;
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