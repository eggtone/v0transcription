import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import { transcribeAudio } from '@/services/whisper';
import { createApiClient } from '@/services/api-client';
import { DetailedTranscription } from '@/types';
import { createSegmentsFromText } from '@/utils';

// Set timeouts for the transcription process
const LOCAL_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes for local models
const GROQ_TIMEOUT_MS = 10 * 60 * 1000;  // 10 minutes for Groq models

export async function POST(request: NextRequest) {
  console.log('YouTube Transcription API called');
  
  try {
    // Get form data from the request
    const formData = await request.formData();
    const youtubeAudioUrl = formData.get('youtubeAudioUrl') as string | null;
    const title = formData.get('title') as string || 'youtube-audio';
    const modelOption = formData.get('model') as string || 'whisper-tiny';

    if (!youtubeAudioUrl) {
      return NextResponse.json({ error: 'No YouTube audio URL provided' }, { status: 400 });
    }

    console.log(`Received YouTube transcription request with model: ${modelOption}`);
    
    // Create a temporary directory for processing files
    const tmpDir = path.join(os.tmpdir(), 'whisper-temp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Create unique filenames based on timestamp
    const timestamp = Date.now();
    const audioFilePath = path.join(tmpDir, `youtube_audio_${timestamp}.mp3`);

    // Check if the URL is a relative URL (starts with /)
    const isRelativeUrl = youtubeAudioUrl.startsWith('/');
    
    // For relative URLs, we need to read the file directly from the file system
    if (isRelativeUrl) {
      console.log(`Processing relative URL: ${youtubeAudioUrl}`);
      
      // Extract the video ID from the URL
      const videoIdMatch = youtubeAudioUrl.match(/\/api\/youtube\/audio\/([^\/]+)/);
      if (!videoIdMatch || !videoIdMatch[1]) {
        return NextResponse.json({ error: 'Invalid YouTube audio URL format' }, { status: 400 });
      }
      
      const videoId = videoIdMatch[1];
      const tempDir = os.tmpdir();
      const sourceFilePath = path.join(tempDir, `${videoId}.mp3`);
      
      // Check if the file exists
      if (!fs.existsSync(sourceFilePath)) {
        return NextResponse.json({ 
          error: `Audio file not found: ${sourceFilePath}` 
        }, { status: 404 });
      }
      
      // Copy the file to our processing directory
      fs.copyFileSync(sourceFilePath, audioFilePath);
      console.log(`Audio copied from: ${sourceFilePath} to: ${audioFilePath}`);
    } else {
      // Download the audio file from an absolute URL
      console.log(`Downloading audio from: ${youtubeAudioUrl}`);
      const response = await axios({
        method: 'GET',
        url: youtubeAudioUrl,
        responseType: 'arraybuffer'
      });

      // Save file to disk
      fs.writeFileSync(audioFilePath, Buffer.from(response.data));
      console.log(`Audio saved to: ${audioFilePath}`);
    }

    let transcriptionResult: DetailedTranscription;
    
    try {
      // Check if we should use local Whisper or Groq API
      if (modelOption.startsWith('whisper-')) {
        // Extract the model name from the option and check if GPU is requested
        const isGpuModel = modelOption.endsWith('-gpu');
        const baseModelOption = isGpuModel ? modelOption.replace('-gpu', '') : modelOption;
        const model = baseModelOption.replace('whisper-', '');
        
        // Set a timeout for the transcription process
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Transcription timed out after ${LOCAL_TIMEOUT_MS / 60000} minutes`));
          }, LOCAL_TIMEOUT_MS);
        });
        
        // Start the transcription with the appropriate device setting
        const transcriptionPromise = transcribeAudio(
          audioFilePath, 
          model, 
          tmpDir,
          isGpuModel // Pass whether to use GPU
        );
        
        // Race between transcription and timeout
        const result = await Promise.race([
          transcriptionPromise,
          timeoutPromise
        ]);
        
        // Create detailed transcription
        // If we have segments from Whisper JSON output, use them
        if (result.segments && result.segments.length > 0) {
          console.log(`Using ${result.segments.length} segments from Whisper JSON output`);
          transcriptionResult = {
            text: result.transcription,
            segments: result.segments,
            language: 'en'
          };
        } else {
          // Fallback to creating segments from raw text
          console.log('No segments in Whisper output, creating from text');
          transcriptionResult = createSegmentsFromText(result.transcription);
        }
        
        // Add processing time information if available
        if (result.processingTime) {
          transcriptionResult.processingTime = result.processingTime;
          transcriptionResult.usedGpu = isGpuModel && !result.usedFallback;
        }
        
        // Clean up output file if it exists
        try {
          if (fs.existsSync(result.outputPath)) {
            fs.unlinkSync(result.outputPath);
          }
        } catch (err) {
          console.error('Error cleaning up output file:', err);
        }
      } else if (modelOption.startsWith('groq-')) {
        // Use Groq API for transcription
        const apiClient = createApiClient(modelOption);
        const audioBuffer = fs.readFileSync(audioFilePath);
        
        // Set a timeout for the Groq API transcription
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Groq API transcription timed out after ${GROQ_TIMEOUT_MS / 60000} minutes`));
          }, GROQ_TIMEOUT_MS);
        });
        
        // Race between transcription and timeout
        transcriptionResult = await Promise.race([
          apiClient.transcribeAudio(audioBuffer, title),
          timeoutPromise
        ]);
      } else {
        return NextResponse.json(
          { error: `Unknown model option: ${modelOption}` },
          { status: 400 }
        );
      }
      
      // Clean up temp file if it still exists
      try {
        if (fs.existsSync(audioFilePath)) {
          fs.unlinkSync(audioFilePath);
        }
      } catch (err) {
        console.error('Error cleaning up audio file:', err);
      }
      
      return NextResponse.json({ transcription: transcriptionResult });
    } catch (error) {
      // Clean up temp file if it exists
      try {
        if (fs.existsSync(audioFilePath)) {
          fs.unlinkSync(audioFilePath);
        } 
      } catch (err) {
        console.error('Error cleaning up audio file:', err);
      }
      
      throw error; // Rethrow for the outer catch block to handle
    }
  } catch (error) {
    console.error('Error in YouTube transcription:', error);
    
    return NextResponse.json(
      { error: `YouTube transcription failed: ${(error as Error).message}` },
      { status: 500 }
    );
  }
} 