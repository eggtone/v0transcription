import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';
import path from 'path';
import logger from '@server/lib/logger';
import fs from 'fs';

// Create a child logger for the YouTube info module
const ytInfoLogger = logger.child({ module: 'yt-info' });

// yt-dlp wrapper class for executing commands
class YTDlpWrap {
  private ytdlpPath: string;
  private logger: typeof logger;

  constructor(parentLogger: typeof logger) {
    this.ytdlpPath = process.env.YTDLP_PATH || 'yt-dlp';
    this.logger = parentLogger;
  }

  exec(args: string[], options: { onData?: (data: string) => void; onError?: (data: string) => void } = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      this.logger.debug({ args: args.join(' ') }, 'Executing yt-dlp command');
      
      const ytdlp = spawn(this.ytdlpPath, args);
      let stdout = '';
      let stderr = '';

      ytdlp.stdout.on('data', (data) => {
        const dataStr = data.toString();
        stdout += dataStr;
        if (options.onData) options.onData(dataStr);
      });

      ytdlp.stderr.on('data', (data) => {
        const dataStr = data.toString();
        stderr += dataStr;
        if (options.onError) options.onError(dataStr);
      });

      ytdlp.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          this.logger.error({ code, stderr }, 'yt-dlp command failed');
          reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
        }
      });

      ytdlp.on('error', (err) => {
        this.logger.error({ err }, 'Failed to spawn yt-dlp process');
        reject(new Error(`Failed to spawn yt-dlp process: ${err.message}`));
      });
    });
  }
}

export async function POST(request: NextRequest) {
  const requestId = uuidv4();
  const handlerLogger = ytInfoLogger.child({ requestId });
  const ytdlp = new YTDlpWrap(handlerLogger);
  const warnings: string[] = [];

  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: "Missing YouTube URL" }, { status: 400 });
    }

    handlerLogger.info({ url }, 'Fetching YouTube video info');

    // Only get video info, not extracting audio
    try {
      const videoInfoRaw = await ytdlp.exec([
        url,
        '--dump-json',
        '--no-playlist',
        '--skip-download', // Skip downloading, we just want metadata
      ], {
        onError: (msg) => { if (msg.trim()) warnings.push(msg.trim()); }
      });
      
      const videoInfo = JSON.parse(videoInfoRaw);
      handlerLogger.debug({ videoId: videoInfo?.id, title: videoInfo?.title }, 'Video info fetched');
      
      // Extract only the needed fields to keep response size small
      return NextResponse.json({
        id: videoInfo.id,
        title: videoInfo.title || 'Unknown Title',
        duration: videoInfo.duration || 0,
        thumbnailUrl: videoInfo.thumbnail || '',
        warnings: warnings.length > 0 ? warnings : undefined
      });
      
    } catch (error) {
      handlerLogger.error({ url, error }, "Error getting video info");
      return NextResponse.json({ 
        error: "The video is unavailable or has been removed from YouTube",
        details: error instanceof Error ? error.message : "Unknown error",
        warnings
      }, { status: 404 });
    }

  } catch (error) {
    handlerLogger.error({ err: error }, "Error processing YouTube info request");
    return NextResponse.json(
      { 
        error: `Failed to fetch YouTube info: ${error instanceof Error ? error.message : "Unknown error"}`,
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