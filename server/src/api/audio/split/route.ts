import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from '@/utils/logger'; // Import logger
import { z } from "zod"; // Import Zod

const execPromise = promisify(exec);

// Standardized base temporary directory
const BASE_TEMP_DIR = path.join(os.tmpdir(), "transcriptor-temp");

/**
 * Quality settings (numeric values used by ffmpeg -q:a)
 */
const MP3QualitySchema = z.coerce.number().int().min(0).max(9); // FFmpeg -q:a range is 0-9
// Define Zod schema for FormData fields
const SplitAudioSchema = z.object({
  file: z.instanceof(File, { message: "Audio file is required" })
    .refine(file => file.size > 0, "Uploaded file cannot be empty")
    .refine(file => file.size < 500 * 1024 * 1024, "File size must be less than 500MB"), // Increased limit for splitting
  numParts: z.coerce.number().int().min(2, "Must split into at least 2 parts").max(50, "Cannot split into more than 50 parts"), // Added min/max
  quality: MP3QualitySchema.optional(),
});

/**
 * Quality settings for MP3 Variable Bitrate (VBR)
 * These correspond to the FFmpeg -q:a values
 */
enum MP3Quality {
  HIGH = 1,      // High quality (roughly equivalent to 220-260 kbps)
  MEDIUM = 2,    // Medium quality (roughly equivalent to 170-210 kbps)
  LOW = 5,       // Low quality (roughly equivalent to 120-150 kbps)
  VERY_LOW = 7   // Very low quality (roughly equivalent to 80-100 kbps)
}

/**
 * Handle audio splitting using FFmpeg
 */
export async function POST(request: NextRequest) {
  const requestId = uuidv4(); 
  const handlerLogger = logger.child({ requestId, route: '/api/audio/split' });

  handlerLogger.info('Audio split request received');

  const sessionTmpDir = path.join(BASE_TEMP_DIR, `split_${requestId}`);
  let inputFilePath: string | null = null;
  const outputPaths: string[] = [];

  try {
    // --- Add ffprobe check --- 
    try {
      handlerLogger.debug('Checking ffprobe accessibility...');
      await execPromise('ffprobe -version'); 
      handlerLogger.info('ffprobe check successful.');
    } catch (ffprobeError) {
      handlerLogger.error({ err: ffprobeError }, 'ffprobe command failed. Check installation and PATH.');
      return NextResponse.json(
        { error: "Server configuration error: ffprobe is not accessible." },
        { status: 500 }
      );
    }
    // --- End ffprobe check ---

    if (!fs.existsSync(BASE_TEMP_DIR)) {
      handlerLogger.debug({ path: BASE_TEMP_DIR }, 'Creating base temp directory');
      fs.mkdirSync(BASE_TEMP_DIR, { recursive: true });
    }
    // Ensure session temp directory exists
    if (!fs.existsSync(sessionTmpDir)) {
      fs.mkdirSync(sessionTmpDir, { recursive: true });
      handlerLogger.debug({ path: sessionTmpDir }, 'Created session temp directory');
    } else {
       handlerLogger.warn({ path: sessionTmpDir }, 'Session temp directory already existed?');
    }
    
    const formData = await request.formData();
    
    // Extract data for validation
    const fileValue = formData.get('file');
    const numPartsValue = formData.get('numParts');
    const qualityValue = formData.get('quality');

    // Validate using Zod
    const validationResult = SplitAudioSchema.safeParse({
      file: fileValue instanceof File ? fileValue : undefined,
      numParts: numPartsValue, // Zod coerces to number
      quality: qualityValue,   // Zod coerces to number
    });

    if (!validationResult.success) {
      handlerLogger.warn({ errors: validationResult.error.errors }, 'Invalid audio split request data');
      const errorMessages = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      return NextResponse.json(
        { error: `Invalid request data: ${errorMessages}`, details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    // Use validated data
    const { file, numParts } = validationResult.data;
    // Use default quality if not provided or invalid
    const quality = validationResult.data.quality ?? 5; // Default to quality 5 (LOW)

    handlerLogger.info({ filename: file.name, size: file.size, parts: numParts, quality }, 'Processing validated audio split request');
    
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const safeInputFilename = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    inputFilePath = path.join(sessionTmpDir, safeInputFilename);
    fs.writeFileSync(inputFilePath, buffer);
    handlerLogger.debug({ path: inputFilePath }, 'Input file saved');
    
    const inputPathQuoted = `"${inputFilePath}"`; 
    handlerLogger.debug('Getting audio duration via ffprobe');
    let totalDuration: number;
    try {
      const { stdout: durationOutput, stderr: ffprobeStderr } = await execPromise(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${inputPathQuoted}`
      );
      if (ffprobeStderr) handlerLogger.warn({ stderr: ffprobeStderr }, 'ffprobe (duration) generated stderr output');
      totalDuration = parseFloat(durationOutput.trim());
      handlerLogger.debug({ duration: totalDuration }, 'Audio duration determined');
      if (isNaN(totalDuration) || totalDuration <= 0) {
        throw new Error("Could not determine valid audio duration");
      }
    } catch (durationError) {
      handlerLogger.error({ err: durationError, path: inputFilePath }, 'Error getting duration');
      throw new Error(`Failed to get audio duration: ${durationError instanceof Error ? durationError.message : String(durationError)}`);
    }
    
    const partDuration = totalDuration / numParts;
    const parts = [];
    
    for (let i = 0; i < numParts; i++) {
      const currentPartNum = i + 1;
      handlerLogger.debug({ part: currentPartNum, total: numParts }, `Processing part`);
      
      const startTime = i * partDuration;
      const segmentDuration = (i === numParts - 1) ? (totalDuration - startTime) : partDuration;
      
      const outputFileName = `${path.parse(safeInputFilename).name}_part${currentPartNum}.mp3`;
      const outputFilePath = path.join(sessionTmpDir, outputFileName);
      outputPaths.push(outputFilePath);
      const outputPathQuoted = `"${outputFilePath}"`;
      
      const ffmpegCmd = `ffmpeg -y -i ${inputPathQuoted} -ss ${startTime} -t ${segmentDuration} -c:a libmp3lame -q:a ${quality} ${outputPathQuoted}`;
      
      try {
        handlerLogger.debug({ part: currentPartNum, command: ffmpegCmd }, `Running FFmpeg command`);
        const { stderr: ffmpegStderr } = await execPromise(ffmpegCmd);
        if (ffmpegStderr) handlerLogger.warn({ part: currentPartNum, stderr: ffmpegStderr }, 'FFmpeg command generated stderr output');
      } catch (ffmpegError) {
        handlerLogger.error({ part: currentPartNum, command: ffmpegCmd, err: ffmpegError }, 'Error running FFmpeg command');
        throw new Error(`FFmpeg execution failed for part ${currentPartNum}: ${ffmpegError instanceof Error ? ffmpegError.message : String(ffmpegError)}`);
      }

      if (!fs.existsSync(outputFilePath)) {
        handlerLogger.error({ path: outputFilePath, part: currentPartNum }, 'FFmpeg failed to create output file');
        throw new Error(`FFmpeg failed to create output file for part ${currentPartNum}`);
      }
      const stats = fs.statSync(outputFilePath);
      const fileSize = stats.size;
      
      const fileData = fs.readFileSync(outputFilePath);
      const base64Data = fileData.toString('base64');
      
      parts.push({
        name: outputFileName,
        size: fileSize,
        duration: segmentDuration,
        data: base64Data
      });
      handlerLogger.debug({ part: currentPartNum }, `Part created successfully`);
    }
    
    const totalSize = parts.reduce((sum, part) => sum + part.size, 0);
    handlerLogger.info({ parts: parts.length, totalSize }, `All parts completed successfully`);
    return NextResponse.json({ 
      success: true, 
      parts: parts,
      totalSize: totalSize
    });
    
  } catch (error) {
    handlerLogger.error({ err: error }, 'Error during audio split request');
    return NextResponse.json(
      { error: `Failed to split audio: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 }
    );
  } finally {
     handlerLogger.debug({ path: sessionTmpDir }, `Cleaning up session directory`);
     try {
      if (inputFilePath && fs.existsSync(inputFilePath)) {
        fs.unlinkSync(inputFilePath);
      }
      outputPaths.forEach((filePath) => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
      if (fs.existsSync(sessionTmpDir)) {
         fs.rmdirSync(sessionTmpDir);
         handlerLogger.debug("Temporary session directory cleaned up");
      } else {
         handlerLogger.warn("Temporary session directory already removed or not created.");
      }
    } catch (cleanupError) {
      handlerLogger.warn({ path: sessionTmpDir, err: cleanupError }, 'Error cleaning up temporary files');
    }
  }
} 