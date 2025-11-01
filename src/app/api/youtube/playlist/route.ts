import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { isValidYouTubeUrl } from '@/services/youtube';

// A server-side wrapper class for yt-dlp operations
class YTDlpWrap {
  private ytdlpPath: string;
  
  constructor() {
    // Read path from environment variable or use default
    const defaultPath = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    this.ytdlpPath = process.env.YT_DLP_EXECUTABLE_PATH || defaultPath;
    // Basic console log here as no logger instance is readily available
    console.log(`[YTDlpWrap - Playlist] Using yt-dlp executable path: ${this.ytdlpPath}`); 
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
          // This helps handle cases where some videos in a playlist are unavailable
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

interface VideoInfo {
  id: string;
  title: string;
  duration?: number;
  url: string;
  [key: string]: any;
}

interface PlaylistMetadata {
  title: string;
  uploader: string;
  description: string;
  webpage_url: string;
  entries_count: number;
  unavailable_count?: number;
  [key: string]: any;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const playlistId = searchParams.get('id');
  
  if (!playlistId) {
    return NextResponse.json({ error: "Playlist ID is required" }, { status: 400 });
  }
  
  try {
    // Create a new ytdlp instance
    const ytdlp = new YTDlpWrap();
    
    // Construct the playlist URL
    const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
    
    // Initialize basic metadata
    let playlistMetadata = {
      title: 'YouTube Playlist',
      uploader: 'Unknown Uploader', 
      description: '',
      webpage_url: playlistUrl,
      entries_count: 0,
      unavailable_count: 0
    };
    
    // Get playlist info using simplified approach with error handling
    const playlistInfoRaw = await ytdlp.exec([
      playlistUrl,
      '--dump-json',
      '--flat-playlist',
      '--no-progress',
      '--ignore-errors' // Continue despite errors with individual videos
    ]);
    
    // Parse JSON lines from ytdlp output with graceful error handling
    let unavailableCount = 0;
    const warnings: string[] = [];
    
    const videos = playlistInfoRaw
      .trim()
      .split('\n')
      .filter(line => line.trim() !== '')
      .map((line, index) => {
        try {
          const videoInfo = JSON.parse(line) as VideoInfo;
          
          // Check if video is unavailable or deleted
          if (!videoInfo.id || videoInfo.title === '[Deleted video]' || videoInfo.title === '[Private video]') {
            unavailableCount++;
            const warningMsg = `Video ${index + 1} is unavailable (${videoInfo.title || 'Unknown reason'})`;
            warnings.push(warningMsg);
            console.warn(`[Playlist] ${warningMsg}`);
            
            return {
              id: videoInfo.id || `unavailable-${index}`,
              title: videoInfo.title || '[Unavailable Video]',
              duration: null,
              url: videoInfo.id ? `https://www.youtube.com/watch?v=${videoInfo.id}` : null,
              unavailable: true,
              reason: videoInfo.title === '[Deleted video]' ? 'deleted' : 
                     videoInfo.title === '[Private video]' ? 'private' : 'unknown'
            };
          }
          
          return {
            id: videoInfo.id,
            title: videoInfo.title || 'Unknown Title',
            duration: videoInfo.duration, 
            url: `https://www.youtube.com/watch?v=${videoInfo.id}`,
            unavailable: false
          };
        } catch (e) {
          console.error('Error parsing video info:', e, 'Line:', line);
          unavailableCount++;
          const warningMsg = `Failed to parse video ${index + 1} data`;
          warnings.push(warningMsg);
          
          return {
            id: `parse-error-${index}`,
            title: '[Parse Error]',
            duration: null,
            url: null,
            unavailable: true,
            reason: 'parse-error'
          };
        }
      })
      .filter(Boolean);
    
    // Update entries count and unavailable count
    playlistMetadata.entries_count = videos.length;
    playlistMetadata.unavailable_count = unavailableCount;
    
    // Separate available and unavailable videos for summary
    const availableVideos = videos.filter(v => !v.unavailable);
    const unavailableVideos = videos.filter(v => v.unavailable);
    
    // Return playlist data with detailed information
    return NextResponse.json({
      id: playlistId,
      ...playlistMetadata,
      videos: videos, // Include all videos (available and unavailable)
      available_count: availableVideos.length,
      unavailable_count: unavailableCount,
      warnings: warnings.length > 0 ? warnings : undefined,
      summary: {
        total: videos.length,
        available: availableVideos.length,
        unavailable: unavailableCount,
        deleted: unavailableVideos.filter(v => v.reason === 'deleted').length,
        private: unavailableVideos.filter(v => v.reason === 'private').length,
        errors: unavailableVideos.filter(v => v.reason === 'parse-error').length
      }
    });
    
  } catch (error) {
    console.error('Error fetching playlist:', error);
    return NextResponse.json(
      { error: `Failed to fetch playlist: ${error instanceof Error ? error.message : "Unknown error"}` }, 
      { status: 500 }
    );
  }
} 