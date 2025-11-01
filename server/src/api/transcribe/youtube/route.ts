import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid'; // For request ID
import logger from '@server/lib/logger'; // Import logger
import { runTranscription } from '@/services/transcription-service';
import { z } from "zod"; // Import Zod

// Define Zod schema for expected FormData fields
const TranscribeYoutubeSchema = z.object({
  youtubeAudioUrl: z.string().min(1, "YouTube audio URL is required"),
  // Add more specific URL validation if needed, e.g., using .url() or .regex()
  title: z.string().min(1, "Title is required"),
  model: z.string().min(1, "Model option is required"),
});

/**
 * Handles YouTube transcription request using the centralized transcription service.
 */
export async function POST(request: NextRequest) {
  const requestId = uuidv4();
  const handlerLogger = logger.child({ requestId, route: '/api/transcribe/youtube' });

  handlerLogger.info('YouTube transcription request received');
  
  const tmpDir = path.join(os.tmpdir(), 'transcriptor-temp'); 
  let audioFilePath: string | null = null;
  let sourceAudioPath: string | null = null;

  try {
    if (!fs.existsSync(tmpDir)) {
      handlerLogger.debug({ path: tmpDir }, 'Creating temp directory');
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const formData = await request.formData();
    
    // Extract data for validation
    const youtubeAudioUrlValue = formData.get('youtubeAudioUrl');
    const titleValue = formData.get('title');
    const modelValue = formData.get('model');

    // Validate using Zod
    const validationResult = TranscribeYoutubeSchema.safeParse({
      youtubeAudioUrl: typeof youtubeAudioUrlValue === 'string' ? youtubeAudioUrlValue : undefined,
      title: typeof titleValue === 'string' ? titleValue : undefined,
      model: typeof modelValue === 'string' ? modelValue : undefined,
    });

    if (!validationResult.success) {
      handlerLogger.warn({ errors: validationResult.error.errors }, 'Invalid YouTube transcription request data');
      const errorMessages = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      return NextResponse.json(
        { error: `Invalid request data: ${errorMessages}`, details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    // Use validated data
    const { youtubeAudioUrl, title, model } = validationResult.data;

    handlerLogger.info({ title, model, url: youtubeAudioUrl }, 'Processing validated YouTube transcription request');
    
    const timestamp = Date.now();
    const uniqueId = `youtube_process_${requestId}_${timestamp}`;
    audioFilePath = path.join(tmpDir, `${uniqueId}.mp3`);

    const isRelativeUrl = youtubeAudioUrl.startsWith('/');
    
    if (isRelativeUrl) {
      handlerLogger.debug({ url: youtubeAudioUrl }, 'Processing relative YouTube URL');
      
      const fileMatch = youtubeAudioUrl.match(/[?&]file=([^&]+)/);
      const sourceFileName = fileMatch ? fileMatch[1] : null;

      if (!sourceFileName) {
          handlerLogger.error({ url: youtubeAudioUrl }, 'Could not extract filename from relative URL');
          return NextResponse.json({ error: 'Invalid relative YouTube audio URL format' }, { status: 400 });
      }

      sourceAudioPath = path.join(tmpDir, sourceFileName);
      handlerLogger.debug({ path: sourceAudioPath }, 'Looking for source audio file');
      
      if (!fs.existsSync(sourceAudioPath)) {
        handlerLogger.warn({ path: sourceAudioPath }, 'Source audio file not found in standard temp dir');
        const oldSourceDir = path.join(process.cwd(), "tmp");
        const oldSourceAudioPath = path.join(oldSourceDir, sourceFileName);
        if (fs.existsSync(oldSourceAudioPath)) {
             handlerLogger.warn({ path: oldSourceAudioPath }, 'Source audio file found in legacy temp dir. Copying.');
             sourceAudioPath = oldSourceAudioPath;
        } else {
          handlerLogger.error({ path: sourceAudioPath, legacyPath: oldSourceAudioPath }, 'Extracted YouTube audio file not found in standard or legacy temp dir');
          return NextResponse.json({ 
            error: `Extracted YouTube audio file not found (${sourceFileName}). It might have been cleaned up or extraction failed.` 
          }, { status: 404 });
        }
      }
      
      fs.copyFileSync(sourceAudioPath, audioFilePath);
      handlerLogger.debug({ source: sourceAudioPath, destination: audioFilePath }, 'Audio copied to processing path');
      
    } else {
      handlerLogger.debug({ url: youtubeAudioUrl }, 'Downloading audio from absolute URL');
      const response = await axios({
        method: 'GET',
        url: youtubeAudioUrl,
        responseType: 'arraybuffer'
      });
      fs.writeFileSync(audioFilePath, Buffer.from(response.data));
      handlerLogger.debug({ path: audioFilePath, size: response.data.length }, 'Downloaded audio saved to processing path');
    }

    handlerLogger.debug('Calling transcription service');
    const transcriptionResult = await runTranscription(
      audioFilePath, 
      title, 
      model,
      tmpDir 
    );

    handlerLogger.info({ title, model }, 'YouTube transcription successful');
    return NextResponse.json({ transcription: transcriptionResult });

  } catch (error) {
    handlerLogger.error({ err: error }, 'Error during YouTube transcription request');
    return NextResponse.json(
      { error: `YouTube transcription failed: ${(error as Error).message}` },
      { status: 500 }
    );
  } finally {
    if (audioFilePath && fs.existsSync(audioFilePath)) {
      try {
        fs.unlinkSync(audioFilePath);
        handlerLogger.debug({ path: audioFilePath }, 'Cleaned up temporary processing file');
      } catch (cleanupError) {
        handlerLogger.warn({ path: audioFilePath, err: cleanupError }, 'Error cleaning up temporary processing file');
      }
    }
  }
} 