import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const execPromise = promisify(exec);

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
  console.log('Audio split API called');

  try {
    // Create a unique session ID for this splitting operation
    const sessionId = uuidv4();
    
    // Get form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const numPartsStr = formData.get('numParts') as string;
    const qualityStr = formData.get('quality') as string;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    // Parse parameters
    const numParts = parseInt(numPartsStr) || 3;
    const quality = parseInt(qualityStr) || MP3Quality.LOW;
    
    console.log(`Received audio split request: ${file.name}, ${numParts} parts, quality: ${quality}`);
    
    // Convert File to Buffer for processing
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Create a temporary directory for processing files
    const tmpDir = path.join(os.tmpdir(), `audio-split-${sessionId}`);
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    
    // Save the input file
    const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    const inputFilePath = path.join(tmpDir, file.name);
    fs.writeFileSync(inputFilePath, buffer);
    
    // Get the file duration using FFmpeg
    console.log("Getting audio duration...");
    const { stdout: durationOutput } = await execPromise(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputFilePath}"`
    );
    
    const totalDuration = parseFloat(durationOutput.trim());
    console.log(`Audio duration: ${totalDuration}s`);
    
    if (isNaN(totalDuration) || totalDuration <= 0) {
      return NextResponse.json({ error: "Could not determine audio duration" }, { status: 400 });
    }
    
    // Calculate the duration of each part
    const partDuration = totalDuration / numParts;
    
    // Array to store part metadata
    const parts = [];
    
    // Process each part
    for (let i = 0; i < numParts; i++) {
      console.log(`Processing part ${i+1}/${numParts}`);
      
      // Calculate the start and end time for this part
      const startTime = i * partDuration;
      const endTime = Math.min((i + 1) * partDuration, totalDuration);
      const segmentDuration = endTime - startTime;
      
      // Create output file path
      const outputFileName = `${fileNameWithoutExt}_part${i + 1}.mp3`;
      const outputFilePath = path.join(tmpDir, outputFileName);
      
      // Build the FFmpeg command
      const ffmpegCmd = `ffmpeg -y -i "${inputFilePath}" -ss ${startTime} -t ${segmentDuration} -c:a libmp3lame -q:a ${quality} "${outputFilePath}"`;
      
      // Execute FFmpeg
      console.log(`Running FFmpeg command for part ${i+1}`);
      await execPromise(ffmpegCmd);
      
      // Get the output file stats
      const stats = fs.statSync(outputFilePath);
      const fileSize = stats.size;
      
      // Read the file into a buffer
      const fileData = fs.readFileSync(outputFilePath);
      const base64Data = fileData.toString('base64');
      
      // Add part metadata to array
      parts.push({
        name: outputFileName,
        size: fileSize,
        duration: segmentDuration,
        data: base64Data // Base64 encode the file data
      });
      
      console.log(`Part ${i+1} created: ${outputFileName} (${fileSize} bytes)`);
    }
    
    // Calculate total size
    const totalSize = parts.reduce((sum, part) => sum + part.size, 0);
    console.log(`All parts completed. Total size: ${totalSize} bytes`);
    
    // Clean up temporary files
    try {
      fs.unlinkSync(inputFilePath);
      parts.forEach((part) => {
        const filePath = path.join(tmpDir, part.name);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
      fs.rmdirSync(tmpDir);
      console.log("Temporary files cleaned up");
    } catch (cleanupError) {
      console.error("Error cleaning up temporary files:", cleanupError);
    }
    
    return NextResponse.json({ 
      success: true, 
      parts: parts,
      totalSize: totalSize
    });
    
  } catch (error) {
    console.error('Error in audio split:', error);
    return NextResponse.json(
      { error: `Failed to split audio: ${(error as Error).message}` },
      { status: 500 }
    );
  }
} 