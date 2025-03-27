import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { headers } from 'next/headers';

// Directory where extracted audio files are stored temporarily
const TEMP_DIR = path.join(process.cwd(), "tmp");

// Ensure the temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Validates that a filename/path is safe to use (no path traversal)
 */
function isValidFilename(filename: string): boolean {
  return Boolean(
    filename && 
    !filename.includes('..') && 
    !filename.includes('/') && 
    !filename.includes('\\')
  );
}

/**
 * Serves audio files from the temporary directory
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const fileParam = url.searchParams.get('file');
  const videoIdParam = url.searchParams.get('videoId'); 
  
  // Get the filename from either parameter
  const filename = fileParam || (videoIdParam ? `${videoIdParam}.mp3` : null);
  
  if (!filename) {
    return NextResponse.json({ error: "Missing file parameter" }, { status: 400 });
  }
  
  // Security check for path traversal
  if (!isValidFilename(filename)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }
  
  const filePath = path.join(TEMP_DIR, filename);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  
  try {
    // Get file stats
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    
    // Handle range requests for streaming
    const headersList = headers();
    const range = headersList.get('range');
    
    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      
      // Create readable stream
      const file = fs.createReadStream(filePath, { start, end });
      
      // Return partial content response with proper headers
      const response = new NextResponse(file as any, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': 'audio/mpeg',
        },
      });
      
      return response;
    } else {
      // Return full file
      const file = fs.readFileSync(filePath);
      
      return new NextResponse(file, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': fileSize.toString(),
        },
      });
    }
  } catch (error) {
    console.error('Error serving audio file:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 