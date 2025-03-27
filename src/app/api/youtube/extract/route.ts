import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { isValidYouTubeUrl } from '@/services/youtube';
import { MP3Quality, DEFAULT_MP3_QUALITY } from '@/utils/audio-utils';

// Directory where extracted audio files will be stored temporarily
const TEMP_DIR = path.join(process.cwd(), "tmp");

// Ensure the temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// A server-side wrapper class for yt-dlp operations
class YTDlpWrap {
  private ytdlpPath: string;
  
  constructor() {
    // Use system yt-dlp if available
    this.ytdlpPath = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  }
  
  /**
   * Execute a yt-dlp command with the given arguments
   */
  exec(args: string[], options: { onData?: (data: string) => void; onError?: (data: string) => void } = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(this.ytdlpPath, args);
      
      let stdoutChunks: Buffer[] = [];
      let stderrChunks: Buffer[] = [];
      
      childProcess.stdout.on('data', (data: Buffer) => {
        stdoutChunks.push(data);
        if (options.onData) {
          options.onData(data.toString());
        }
      });
      
      childProcess.stderr.on('data', (data: Buffer) => {
        stderrChunks.push(data);
        if (options.onError) {
          options.onError(data.toString());
        }
      });
      
      childProcess.on('close', (code) => {
        if (code === 0 || stdoutChunks.length > 0) {
          // Consider it a success if we got any output, even with non-zero exit code
          const stdout = Buffer.concat(stdoutChunks).toString();
          resolve(stdout);
        } else {
          const stderr = Buffer.concat(stderrChunks).toString();
          reject(new Error(`yt-dlp process exited with code ${code}: ${stderr}`));
        }
      });
      
      childProcess.on('error', (err) => {
        reject(new Error(`Failed to start yt-dlp process: ${err.message}`));
      });
    });
  }
  
  /**
   * Promisified version of the exec method
   */
  execPromise(args: string[]): Promise<string> {
    return this.exec(args);
  }
}

export async function POST(request: NextRequest) {
  let warnings: string[] = [];
  
  try {
    const body = await request.json();
    const { url, quality } = body;

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Check if URL is a valid YouTube URL
    if (!isValidYouTubeUrl(url)) {
      return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
    }

    // Use provided quality or default
    const audioQuality = quality !== undefined ? quality : DEFAULT_MP3_QUALITY;

    // Generate a unique file name based on timestamp and random string
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    const outputFilePath = path.join(TEMP_DIR, `${uniqueId}.mp3`);

    // Create YTDlpWrap instance
    const ytdlp = new YTDlpWrap();

    // Get video info
    let videoInfo;
    try {
      const videoInfoRaw = await ytdlp.exec([
        url,
        '--dump-json',
        '--no-playlist',
      ], {
        onError: (msg) => {
          if (msg.trim()) {
            warnings.push(msg.trim());
          }
        }
      });

      videoInfo = JSON.parse(videoInfoRaw);
    } catch (error) {
      console.error("Error getting video info:", error);
      return NextResponse.json({ 
        error: "The video is unavailable or has been removed from YouTube",
        details: error instanceof Error ? error.message : "Unknown error",
        warnings
      }, { status: 404 });
    }
    
    const videoTitle = videoInfo.title || 'Unknown Title';
    const videoDuration = videoInfo.duration || 0;
    const thumbnailUrl = videoInfo.thumbnail || '';

    // Download and extract audio
    try {
      await ytdlp.exec([
        url,
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', audioQuality.toString(), // Use the specified quality
        '-o', outputFilePath,
        '--no-playlist',
        '--no-part', // Don't use .part files
        '--force-overwrites', // Overwrite if exists
      ], {
        onError: (msg) => {
          if (msg.trim()) {
            warnings.push(msg.trim());
          }
        }
      });
    } catch (error) {
      console.error("Error extracting audio:", error);
      return NextResponse.json({ 
        error: "Failed to extract audio from the video", 
        details: error instanceof Error ? error.message : "Unknown error",
        warnings
      }, { status: 500 });
    }

    // Check if file exists
    if (!fs.existsSync(outputFilePath)) {
      throw new Error(`Failed to extract audio: Output file not found`);
    }

    // Get file size
    const stats = fs.statSync(outputFilePath);
    const fileSize = stats.size;

    // Create a relative URL path for the extracted audio
    // Use the filename route to serve the audio file
    const audioUrl = `/api/youtube/audio?file=${uniqueId}.mp3`;

    return NextResponse.json({
      title: videoTitle,
      audioUrl,
      thumbnailUrl,
      duration: videoDuration,
      fileSize,
      quality: audioQuality, // Include the quality in the response
      warnings: warnings.length > 0 ? warnings : undefined
    });
  } catch (error) {
    console.error("Error extracting YouTube audio:", error);
    return NextResponse.json(
      { 
        error: `Failed to extract YouTube audio: ${error instanceof Error ? error.message : "Unknown error"}`,
        warnings
      },
      { status: 500 }
    );
  }
}

// Set a larger body limit for this route
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}; 