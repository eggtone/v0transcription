import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { isValidYouTubeUrl } from '@/services/youtube';

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
    
    // Capture warnings/errors
    let warnings: string[] = [];
    
    // First try to get playlist metadata to get an idea of how many videos total
    // and see if there are warnings about unavailable videos
    let playlistMetadata = {} as PlaylistMetadata;
    let unavailableCount = 0;

    try {
      // Get playlist name and other metadata with --ignore-errors to continue despite errors
      const playlistMetadataRaw = await ytdlp.exec([
        playlistUrl,
        '--dump-single-json',
        '--no-progress',
        '--ignore-errors', // Continue despite errors with individual videos
      ], {
        onError: (msg) => {
          if (msg.includes("unavailable video")) {
            unavailableCount++;
            warnings.push(msg.trim());
          }
        }
      });
      
      try {
        const metadata = JSON.parse(playlistMetadataRaw) as PlaylistMetadata;
        playlistMetadata = {
          title: metadata.title || 'Unknown Playlist',
          uploader: metadata.uploader || 'Unknown Uploader',
          description: metadata.description || '',
          webpage_url: metadata.webpage_url || playlistUrl,
          entries_count: metadata.entries?.length || 0,
          unavailable_count: unavailableCount
        };
      } catch (e) {
        console.error('Error parsing playlist metadata:', e);
        playlistMetadata = {
          title: 'Unknown Playlist',
          uploader: 'Unknown Uploader',
          description: '',
          webpage_url: playlistUrl,
          entries_count: 0,
          unavailable_count: unavailableCount
        };
      }
    } catch (metadataError) {
      console.error('Error fetching playlist metadata:', metadataError);
      // Continue with what we have
    }
    
    // Now get info for each available video in the playlist
    // Using --flat-playlist to get only basic video info quickly
    // and --ignore-errors to continue despite errors with individual videos
    const playlistInfoRaw = await ytdlp.exec([
      playlistUrl,
      '--dump-json',
      '--flat-playlist',
      '--no-progress',
      '--ignore-errors', // Continue despite errors with individual videos
    ], {
      onError: (msg) => {
        if (msg.includes("unavailable video")) {
          warnings.push(msg.trim());
        }
      }
    });
    
    // Parse JSON lines from ytdlp output
    const videos = playlistInfoRaw
      .trim()
      .split('\n')
      .filter(line => line.trim() !== '')
      .map(line => {
        try {
          const videoInfo = JSON.parse(line) as VideoInfo;
          return {
            id: videoInfo.id,
            title: videoInfo.title || 'Unknown Title',
            duration: videoInfo.duration, 
            url: `https://www.youtube.com/watch?v=${videoInfo.id}`,
            // Add other relevant fields as needed
          };
        } catch (e) {
          console.error('Error parsing video info:', e);
          return null;
        }
      })
      .filter(Boolean);
    
    // Update entries count if we determined it from the videos array
    if (videos.length > 0 && playlistMetadata.entries_count === 0) {
      playlistMetadata.entries_count = videos.length + unavailableCount;
    }
    
    // Return available videos and any warnings about unavailable ones
    return NextResponse.json({
      id: playlistId,
      ...playlistMetadata,
      videos,
      warnings: warnings.length > 0 ? warnings : undefined,
      unavailable_count: unavailableCount
    });
    
  } catch (error) {
    console.error('Error fetching playlist:', error);
    return NextResponse.json(
      { error: `Failed to fetch playlist: ${error instanceof Error ? error.message : "Unknown error"}` }, 
      { status: 500 }
    );
  }
} 