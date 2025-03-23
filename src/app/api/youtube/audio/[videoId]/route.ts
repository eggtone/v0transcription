import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import os from 'os';

export async function GET(
  request: NextRequest,
  { params }: { params: { videoId: string } }
) {
  try {
    // Properly destructure videoId from params
    const { videoId } = params;
    
    // Validate videoId
    if (!videoId) {
      return NextResponse.json({ error: "No video ID provided" }, { status: 400 });
    }
    
    // Get the file path
    const tempDir = os.tmpdir();
    const filePath = path.join(tempDir, `${videoId}.mp3`);
    
    try {
      // Read the file
      const fileBuffer = await readFile(filePath);
      
      // Set headers for audio streaming
      const headers = new Headers();
      headers.set('Content-Type', 'audio/mpeg');
      headers.set('Content-Disposition', `inline; filename="${videoId}.mp3"`); // inline for browser playback
      headers.set('Content-Length', fileBuffer.length.toString()); // Add content-length for better player support
      headers.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
      
      // Return the file
      return new NextResponse(fileBuffer, {
        headers,
      });
    } catch (fileError) {
      console.error('File error:', fileError);
      return NextResponse.json({ 
        error: "Audio file not found or could not be read",
        message: (fileError as Error).message
      }, { status: 404 });
    }
  } catch (error) {
    console.error('Audio streaming error:', error);
    return NextResponse.json(
      { error: `Failed to stream audio: ${(error as Error).message}` },
      { status: 500 }
    );
  }
} 