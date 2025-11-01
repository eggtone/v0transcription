import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid'; // For request ID
import logger from '@server/lib/logger'; // Import logger
import { runTranscription } from '@/services/transcription-service'; // Import the new service
import { z } from "zod"; // Import Zod

// Define Zod schema for expected FormData fields
const TranscribeFileSchema = z.object({
  file: z.instanceof(File, { message: "Audio file is required" })
    .refine(file => file.size > 0, "Uploaded file cannot be empty")
    .refine(file => file.size < 100 * 1024 * 1024, "File size must be less than 100MB"), // Example size limit
  model: z.string().min(1, "Model option is required"), // Further validation could be added
});

/**
 * Handles file transcription request using the centralized transcription service.
 */
export async function POST(request: NextRequest) {
  const requestId = uuidv4();
  const handlerLogger = logger.child({ requestId, route: '/api/transcribe' });

  handlerLogger.info('File transcription request received');
  
  // Define temporary directory path
  const tmpDir = path.join(os.tmpdir(), 'transcriptor-temp'); 
  let audioFilePath: string | null = null; // Keep track of the path for cleanup
  
  try {
    // Ensure temporary directory exists
    if (!fs.existsSync(tmpDir)) {
      handlerLogger.debug({ path: tmpDir }, 'Creating temp directory');
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Get form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const modelOption = formData.get('model') as string || 'whisper-tiny'; // Default model

    if (!file) {
      handlerLogger.warn('No file provided in request');
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate using Zod
    const validationResult = TranscribeFileSchema.safeParse({
      file: file instanceof File ? file : undefined, 
      model: typeof modelOption === 'string' ? modelOption : undefined,
    });

    if (!validationResult.success) {
      handlerLogger.warn({ errors: validationResult.error.errors }, 'Invalid transcription request data');
      const errorMessages = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      return NextResponse.json(
        { error: `Invalid request data: ${errorMessages}`, details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    // Use validated data
    const validatedFile = validationResult.data.file;
    const validatedModel = validationResult.data.model;

    handlerLogger.info({ filename: validatedFile.name, size: validatedFile.size, model: validatedModel }, 'Processing validated file transcription request');
    
    // Convert File to Buffer
    const arrayBuffer = await validatedFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Create unique temporary file path
    const timestamp = Date.now();
    const fileExtension = path.extname(validatedFile.name);
    audioFilePath = path.join(tmpDir, `upload_${requestId}_${timestamp}${fileExtension || '.tmp'}`); 

    // Save buffer to temporary file
    fs.writeFileSync(audioFilePath, buffer);
    handlerLogger.debug({ path: audioFilePath }, 'Temporary audio file saved');

    // Call the centralized transcription service
    const transcriptionResult = await runTranscription(
      audioFilePath,
      validatedFile.name,
      validatedModel,
      tmpDir
    );
    
    handlerLogger.info({ filename: validatedFile.name, model: validatedModel }, 'Transcription successful');

    // Return the result
    return NextResponse.json({ transcription: transcriptionResult });

  } catch (error) {
    handlerLogger.error({ err: error }, 'Error during file transcription request');
    return NextResponse.json(
      { error: `Transcription failed: ${(error instanceof Error ? error.message : String(error))}` }, 
      { status: 500 }
    );
  } finally {
    // Cleanup: Ensure the temporary audio file is deleted
    if (audioFilePath && fs.existsSync(audioFilePath)) {
      try {
        fs.unlinkSync(audioFilePath);
        handlerLogger.debug({ path: audioFilePath }, 'Cleaned up temporary audio file');
      } catch (cleanupError) {
        handlerLogger.warn({ path: audioFilePath, err: cleanupError }, 'Error cleaning up temporary audio file');
      }
    }
  }
}

// Removed the old handleLocalTranscription and handleGroqTranscription functions
// as their logic is now in transcription-service.ts 