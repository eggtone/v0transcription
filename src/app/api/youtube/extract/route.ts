import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid'; // For request ID
import logger from '@server/lib/logger'; // Import logger
import { isValidYouTubeUrl } from '@server/services/youtube';
import { MP3Quality, DEFAULT_MP3_QUALITY } from '@server/lib/audio-utils';
import { z } from "zod"; // Import Zod

// Define Zod schema for the request body
const ExtractRequestSchema = z.object({
  url: z.string().url("Invalid URL format").refine(isValidYouTubeUrl, "URL must be a valid YouTube video URL"),
  quality: z.nativeEnum(MP3Quality).optional(), // Use the MP3Quality enum
});

// Standardized temporary directory within the OS temp folder
const TEMP_DIR = path.join(os.tmpdir(), "transcriptor-temp");

// Ensure the standardized temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  try {
    logger.debug({ path: TEMP_DIR }, '[YT Extract] Creating temp directory');
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  } catch (err) {
     if (!fs.existsSync(TEMP_DIR)) {
       logger.error({ path: TEMP_DIR, error: err }, '[YT Extract] Failed to create temp directory');
       throw err; // Rethrow if failed
     }
     logger.warn({ path: TEMP_DIR }, '[YT Extract] Temp directory already existed despite check');
  }
}

// A server-side wrapper class for yt-dlp operations
class YTDlpWrap {
  private ytdlpPath: string;
  private logger: typeof logger;
  
  constructor(parentLogger: typeof logger) {
    this.logger = parentLogger.child({ service: 'YTDlpWrap' });
    // Read path from environment variable or use default
    const defaultPath = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    this.ytdlpPath = process.env.YT_DLP_EXECUTABLE_PATH || defaultPath;
    this.logger.info({ path: this.ytdlpPath }, 'Using yt-dlp executable path');
  }
  
  exec(args: string[], options: { onData?: (data: string) => void; onError?: (data: string) => void } = {}): Promise<string> {
    this.logger.debug({ args }, 'Executing yt-dlp command');
    return new Promise((resolve, reject) => {
      const childProcess = spawn(this.ytdlpPath, args);
      let stdoutChunks: Buffer[] = [];
      let stderrChunks: Buffer[] = [];
      
      childProcess.stdout.on('data', (data: Buffer) => {
        stdoutChunks.push(data);
        // Avoid logging potentially large stdout data by default
        if (options.onData) options.onData(data.toString());
      });
      
      childProcess.stderr.on('data', (data: Buffer) => {
        stderrChunks.push(data);
        const stderrStr = data.toString();
        this.logger.trace({ stderr: stderrStr }, 'yt-dlp stderr data'); // Log stderr at trace level
        if (options.onError) options.onError(stderrStr);
      });
      
      childProcess.on('close', (code) => {
        const stdout = Buffer.concat(stdoutChunks).toString();
        const stderr = Buffer.concat(stderrChunks).toString();
        if (code === 0 || stdoutChunks.length > 0) {
          this.logger.debug({ code, stdoutLength: stdout.length, stderrLength: stderr.length }, 'yt-dlp process finished successfully (or with output)');
          resolve(stdout);
        } else {
          this.logger.error({ code, stderr }, 'yt-dlp process exited with error');
          reject(new Error(`yt-dlp process exited with code ${code}: ${stderr}`));
        }
      });
      
      childProcess.on('error', (err) => {
        this.logger.error({ error: err }, 'Failed to start yt-dlp process');
        reject(new Error(`Failed to start yt-dlp process: ${err.message}`));
      });
    });
  }
  
  execPromise(args: string[]): Promise<string> {
    return this.exec(args);
  }
}

export async function POST(request: NextRequest) {
  const requestId = uuidv4();
  const handlerLogger = logger.child({ requestId, route: '/api/youtube/extract' });

  handlerLogger.info('YouTube extraction request received');
  let warnings: string[] = [];
  let outputFilePath: string | null = null; // Track for cleanup
  
  try {
    const body = await request.json();
    
    // Validate request body using Zod
    const validationResult = ExtractRequestSchema.safeParse(body);
    if (!validationResult.success) {
      handlerLogger.warn({ errors: validationResult.error.errors }, 'Invalid YouTube extraction request body');
      return NextResponse.json(
        { error: "Invalid request body", details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    // Use validated data
    const { url, quality } = validationResult.data;
    handlerLogger.debug({ url, quality }, 'Validated request body');

    const audioQuality = quality !== undefined ? quality : DEFAULT_MP3_QUALITY;
    const uniqueId = `yt_extract_${requestId}_${Date.now()}`;
    const outputFileName = `${uniqueId}.mp3`;
    outputFilePath = path.join(TEMP_DIR, outputFileName);

    // Pass logger to YTDlpWrap instance
    const ytdlp = new YTDlpWrap(handlerLogger);

    // Get video info
    let videoInfo;
    handlerLogger.info({ url }, 'Fetching video info');
    try {
      const videoInfoRaw = await ytdlp.exec([
        url,
        '--dump-json',
        '--no-playlist',
      ], {
        onError: (msg) => { if (msg.trim()) warnings.push(msg.trim()); }
      });
      videoInfo = JSON.parse(videoInfoRaw);
      handlerLogger.debug({ videoId: videoInfo?.id, title: videoInfo?.title }, 'Video info fetched');
    } catch (error) {
      handlerLogger.error({ url, error }, "Error getting video info");
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
    handlerLogger.info({ url, quality: audioQuality, path: outputFilePath }, 'Extracting audio');
    try {
      await ytdlp.exec([
        url,
        '-x', '--audio-format', 'mp3', '--audio-quality', audioQuality.toString(),
        '-o', outputFilePath,
        '--no-playlist', '--no-part', '--force-overwrites',
      ], {
        onError: (msg) => { if (msg.trim()) warnings.push(msg.trim()); }
      });
    } catch (error) {
      handlerLogger.error({ url, path: outputFilePath, error }, "Error extracting audio");
      // Attempt cleanup handled in finally block
      return NextResponse.json({ 
        error: "Failed to extract audio from the video", 
        details: error instanceof Error ? error.message : "Unknown error",
        warnings
      }, { status: 500 });
    }

    if (!fs.existsSync(outputFilePath)) {
       handlerLogger.error({ path: outputFilePath }, 'Output file not found after yt-dlp finished');
      throw new Error(`Failed to extract audio: Output file not found at ${outputFilePath}`);
    }

    const stats = fs.statSync(outputFilePath);
    const fileSize = stats.size;
    const audioUrl = `/api/youtube/audio?file=${outputFileName}`; 

    handlerLogger.info({ path: outputFilePath, size: fileSize, audioUrl }, 'Audio extracted successfully');

    return NextResponse.json({
      title: videoTitle, audioUrl, thumbnailUrl, duration: videoDuration,
      fileSize, quality: audioQuality, tempFileName: outputFileName,
      warnings: warnings.length > 0 ? warnings : undefined
    });

  } catch (error) {
    handlerLogger.error({ err: error }, "Error processing YouTube extraction request");
    return NextResponse.json(
      { 
        error: `Failed to extract YouTube audio: ${error instanceof Error ? error.message : "Unknown error"}`,
        warnings // Include warnings collected so far even on top-level error
      },
      { status: 500 }
    );
  } finally {
       // Attempt to clean up the output file if it exists, regardless of success/failure
       // Commented out immediate cleanup to allow audio endpoint to fetch the file
       // TODO: Implement a proper cleanup mechanism (e.g., background job, TTL)
       // if (outputFilePath && fs.existsSync(outputFilePath)) {
       //     try {
       //         fs.unlinkSync(outputFilePath);
       //         handlerLogger.debug({ path: outputFilePath }, 'Cleaned up temporary extracted file');
       //     } catch (cleanupError) {
       //         handlerLogger.warn({ path: outputFilePath, error: cleanupError }, 'Failed to clean up temporary extracted file');
       //     }
       // }
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