import { NextRequest, NextResponse } from 'next/server';
import YTDlpWrap from 'yt-dlp-wrap';
import { extractVideoId } from '@/services/youtube';
import { createReadStream } from 'fs';
import { unlink } from 'fs/promises';
import path from 'path';
import os from 'os';

// Initialize yt-dlp wrapper
const ytDlp = new YTDlpWrap();

export async function GET(request: NextRequest) {
  try {
    // Get the video ID from the query parameters
    const videoId = request.nextUrl.searchParams.get('videoId');
    
    if (!videoId) {
      return NextResponse.json({ error: "No video ID provided" }, { status: 400 });
    }
    
    // Construct the YouTube URL
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Create a temporary file path for the audio
    const tempDir = os.tmpdir();
    const outputFilePath = path.join(tempDir, `${videoId}.mp3`);
    
    try {
      // Extract audio using yt-dlp
      await ytDlp.execPromise([
        youtubeUrl,
        '-x',                      // Extract audio
        '--audio-format', 'mp3',   // Convert to mp3
        '-o', outputFilePath,      // Output file
        '--no-playlist',           // Don't download playlists
        '--no-warnings',           // Suppress warnings
        '--quiet',                 // Suppress output
      ]);
      
      // Set headers for audio streaming
      const headers = new Headers();
      headers.set('Content-Type', 'audio/mpeg');
      headers.set('Content-Disposition', `attachment; filename="${videoId}.mp3"`);
      
      // We need to use a different approach for streaming files in Next.js API routes
      // Instead of streaming directly, we'll return a redirect to a static file URL
      // In a production environment, you would use a more robust solution
      
      // For now, we'll return a JSON response with the file path
      // The client can then make a request to a separate endpoint to download the file
      return NextResponse.json({
        success: true,
        audioUrl: `/api/youtube/audio/${videoId}`
      });
      
      // Note: We'll need to create a separate API route to handle the audio file streaming
      // This is a limitation of Next.js API routes
    } catch (ytDlpError) {
      console.error('yt-dlp error:', ytDlpError);
      
      // Try a fallback approach if yt-dlp fails
      return NextResponse.json({ 
        error: "Could not extract audio. YouTube may have updated their platform.",
        message: (ytDlpError as Error).message
      }, { status: 500 });
    }
  } catch (error) {
    console.error('YouTube proxy error:', error);
    return NextResponse.json(
      { error: `Failed to proxy YouTube audio: ${(error as Error).message}` },
      { status: 500 }
    );
  }
} 