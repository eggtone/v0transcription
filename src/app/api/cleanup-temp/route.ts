import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import os from 'os';
import logger from '@/utils/logger';
import { z } from "zod";

// Define Zod schema for the request body
const CleanupRequestSchema = z.object({
  tempFileName: z.string().min(1, "Filename is required"),
});

// Same temp directory as defined in extract route
const TEMP_DIR = path.join(os.tmpdir(), "transcriptor-temp");

export async function POST(request: NextRequest) {
  const handlerLogger = logger.child({ route: '/api/cleanup-temp' });
  handlerLogger.info('Cleanup request received');

  try {
    const body = await request.json();
    
    // Validate request body using Zod
    const validationResult = CleanupRequestSchema.safeParse(body);
    if (!validationResult.success) {
      handlerLogger.warn({ errors: validationResult.error.errors }, 'Invalid cleanup request body');
      return NextResponse.json(
        { error: "Invalid request body", details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    // Use validated data
    const { tempFileName } = validationResult.data;
    
    // Security check - only allow files that match our naming pattern
    if (!tempFileName.startsWith('yt_extract_')) {
      handlerLogger.warn({ tempFileName }, 'Security check failed: Filename does not match expected pattern');
      return NextResponse.json(
        { error: "Invalid filename pattern" },
        { status: 400 }
      );
    }

    const filePath = path.join(TEMP_DIR, tempFileName);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      handlerLogger.info({ path: filePath }, 'File not found, may have been already cleaned up');
      return NextResponse.json({ success: true, message: "File not found or already cleaned up" });
    }

    // Delete the file
    try {
      fs.unlinkSync(filePath);
      handlerLogger.info({ path: filePath }, 'Temporary file deleted successfully');
      return NextResponse.json({ success: true });
    } catch (error) {
      handlerLogger.error({ path: filePath, error }, 'Failed to delete temporary file');
      return NextResponse.json(
        { error: "Failed to delete file", details: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 }
      );
    }
  } catch (error) {
    handlerLogger.error({ error }, "Error processing cleanup request");
    return NextResponse.json(
      { error: "Error processing cleanup request", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
} 