import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import os from 'os'; // Import os module
import { headers } from 'next/headers';
import { v4 as uuidv4 } from 'uuid'; // For request ID
import logger from '@server/lib/logger'; // Import logger

// Standardized temporary directory within the OS temp folder
const TEMP_DIR = path.join(os.tmpdir(), "transcriptor-temp");

// Ensure the standardized temp directory exists
// Note: While extract route ensures this, it's safe to have it here too
if (!fs.existsSync(TEMP_DIR)) {
  try {
    logger.debug({ path: TEMP_DIR }, '[YT Audio] Creating temp directory');
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  } catch (err) {
    // Handle potential race condition if directory is created between check and mkdir
    if (!fs.existsSync(TEMP_DIR)) {
      logger.error({ path: TEMP_DIR, error: err }, '[YT Audio] Failed to create temp directory');
    } else {
      logger.warn({ path: TEMP_DIR }, '[YT Audio] Temp directory already existed despite check');
    }
  }
}

/**
 * Validates that a filename/path is safe to use (no path traversal)
 */
function isValidFilename(filename: string): boolean {
  // Basic check: disallow .. , / , \
  // Also ensure it doesn't start with . and has a reasonable extension (e.g., .mp3)
  return Boolean(
    filename && 
    !filename.includes('..') && 
    !filename.includes('/') && 
    !filename.includes('\\') &&
    !filename.startsWith('.') &&
    path.extname(filename) === '.mp3' // Enforce .mp3 extension for safety
  );
}

/**
 * Serves audio files from the temporary directory
 */
export async function GET(request: NextRequest) {
  const requestId = uuidv4();
  const handlerLogger = logger.child({ requestId, route: '/api/youtube/audio' });

  const url = new URL(request.url);
  const fileParam = url.searchParams.get('file');
  
  const filename = fileParam;
  
  handlerLogger.info({ filename }, 'Audio file request received');

  if (!filename) {
    handlerLogger.warn('Missing file parameter in request');
    return NextResponse.json({ error: "Missing 'file' parameter" }, { status: 400 });
  }
  
  if (!isValidFilename(filename)) {
    handlerLogger.warn({ filename }, 'Invalid or disallowed filename requested');
    return NextResponse.json({ error: "Invalid or disallowed filename" }, { status: 400 });
  }
  
  const filePath = path.join(TEMP_DIR, filename);
  
  handlerLogger.debug({ path: filePath }, 'Attempting to serve audio file');

  if (!fs.existsSync(filePath)) {
    handlerLogger.error({ path: filePath }, 'Requested audio file not found');
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  
  try {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    
    const rangeHeader = request.headers.get('range'); // Get range from request headers
    
    if (rangeHeader) {
      handlerLogger.debug({ range: rangeHeader }, 'Handling range request');
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      
      if (isNaN(start) || start < 0 || start >= fileSize) {
        handlerLogger.warn({ range: rangeHeader, start, fileSize }, 'Invalid range start');
        return NextResponse.json({ error: "Invalid Range header start value" }, { status: 416 });
      }
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      
      if (isNaN(end) || end >= fileSize || end < start) {
        handlerLogger.warn({ range: rangeHeader, end, fileSize }, 'Invalid range end');
        return NextResponse.json({ error: "Invalid Range header end value" }, { status: 416 });
      }
      const chunkSize = end - start + 1;
      
      const fileStream = fs.createReadStream(filePath, { start, end });
      
      // Use ReadableStream for NextResponse body
      const responseStream = new ReadableStream({
        start(controller) {
          fileStream.on('data', (chunk) => controller.enqueue(chunk));
          fileStream.on('end', () => controller.close());
          fileStream.on('error', (err) => {
            handlerLogger.error({ path: filePath, error: err }, 'Error reading file stream for range request');
            controller.error(err);
          });
        },
        cancel() {
          handlerLogger.warn({ path: filePath }, 'Range request stream cancelled by client');
          fileStream.destroy();
        }
      });
      
      handlerLogger.info({ path: filePath, start, end, size: chunkSize }, 'Serving partial content');
      return new NextResponse(responseStream, {
        status: 206, // Partial Content
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': 'audio/mpeg',
        },
      });
    } else {
      // Return full file
      handlerLogger.debug({ path: filePath, size: fileSize }, 'Serving full file content');
      const fileBuffer = fs.readFileSync(filePath);
      
      return new NextResponse(fileBuffer, {
        status: 200, // OK
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': fileSize.toString(),
          'Accept-Ranges': 'bytes', // Indicate range requests are accepted
        },
      });
    }
  } catch (error) {
    handlerLogger.error({ path: filePath, err: error }, 'Error serving audio file');
    return NextResponse.json(
      { error: 'Internal server error while serving audio file' },
      { status: 500 }
    );
  }
} 