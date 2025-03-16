import { NextRequest, NextResponse } from 'next/server';
import { isValidYouTubeUrl, extractVideoId } from '@/services/youtube';
import YTDlpWrap from 'yt-dlp-wrap';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Initialize yt-dlp wrapper
const ytDlp = new YTDlpWrap();

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "No YouTube URL provided" }, { status: 400 });
    }

    // Validate YouTube URL
    if (!isValidYouTubeUrl(url)) {
      return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
    }

    // Extract video ID
    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json({ error: "Could not extract YouTube video ID" }, { status: 400 });
    }

    try {
      // Create a temporary file path for the audio
      const tempDir = os.tmpdir();
      const outputFilePath = path.join(tempDir, `${videoId}.mp3`);
      
      // Get video info using yt-dlp
      const videoInfoJson = await ytDlp.getVideoInfo(url);
      
      // Extract relevant information
      const title = videoInfoJson.title || "YouTube Video";
      const thumbnailUrl = videoInfoJson.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      
      // Format duration
      let duration = "Unknown";
      if (videoInfoJson.duration) {
        const durationInSeconds = Math.floor(videoInfoJson.duration);
        const hours = Math.floor(durationInSeconds / 3600);
        const minutes = Math.floor((durationInSeconds % 3600) / 60);
        const seconds = durationInSeconds % 60;
        
        if (hours > 0) {
          duration = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
          duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
      }
      
      // Extract audio using yt-dlp (wait for it to complete)
      console.log(`Extracting audio for video ID: ${videoId}`);
      await ytDlp.execPromise([
        url,
        '-x',                      // Extract audio
        '--audio-format', 'mp3',   // Convert to mp3
        '-o', outputFilePath,      // Output file
        '--no-playlist',           // Don't download playlists
        '--no-warnings',           // Suppress warnings
      ]);
      
      // Verify the file exists and has content
      if (!fs.existsSync(outputFilePath) || fs.statSync(outputFilePath).size === 0) {
        throw new Error("Failed to extract audio: Output file is empty or does not exist");
      }
      
      console.log(`Audio extracted successfully to: ${outputFilePath}`);
      
      // Return video info and audio URL
      return NextResponse.json({
        videoInfo: {
          title,
          audioUrl: `/api/youtube/audio/${videoId}`,
          thumbnailUrl,
          duration
        }
      });
    } catch (error) {
      console.error('YouTube info extraction error:', error);
      
      // Fallback to basic info if yt-dlp fails
      return NextResponse.json({
        error: "Failed to extract audio",
        message: (error as Error).message
      }, { status: 500 });
    }
  } catch (error) {
    console.error('YouTube extraction error:', error);
    return NextResponse.json(
      { error: `Failed to extract audio: ${(error as Error).message}` },
      { status: 500 }
    );
  }
} 