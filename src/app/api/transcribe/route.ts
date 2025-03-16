import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { transcribeAudio, isModelDownloaded, estimateDownloadTime } from '@/services/whisper';
import { createApiClient } from '@/services/api-client';
import { DetailedTranscription } from '@/types';
import { createSegmentsFromText } from '@/utils';

// Set timeouts for the transcription process
const LOCAL_TIMEOUT_MS = 60 * 60 * 1000; // 30 minutes for local models
const GROQ_TIMEOUT_MS = 15 * 60 * 1000;  // 10 minutes for Groq models

// The list of models that should be run locally
const LOCAL_MODELS = (process.env.WHISPER_LOCAL_MODELS || 'tiny,base,small,medium').split(',');

/**
 * Handles transcription request
 */
export async function POST(request: NextRequest) {
  console.log('Transcription API called');
  
  try {
    // Get form data from the request
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const modelOption = formData.get('model') as string || 'whisper-tiny';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    console.log(`Received transcription request with model: ${modelOption}`);
    
    // Convert File to Buffer for processing
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Create a temporary directory for processing files
    const tmpDir = path.join(os.tmpdir(), 'whisper-temp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Create unique filenames based on timestamp
    const timestamp = Date.now();
    const fileExtension = path.extname(file.name);
    const audioFilePath = path.join(tmpDir, `audio_${timestamp}${fileExtension}`);

    // Save file to disk (needed for both local and API-based transcription)
    fs.writeFileSync(audioFilePath, buffer);

    let transcriptionResult: DetailedTranscription;
    
    try {
      // Check if we should use local Whisper or Groq API
      if (modelOption.startsWith('whisper-')) {
        transcriptionResult = await handleLocalTranscription(audioFilePath, modelOption, tmpDir);
      } else if (modelOption.startsWith('groq-')) {
        transcriptionResult = await handleGroqTranscription(buffer, file.name, modelOption);
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
    console.error('Error in transcription:', error);
    
    // Provide a more specific error message if it's a model download issue
    const message = (error as Error).message;
    if (message.includes('No such file or directory') && message.includes('.pt')) {
      return NextResponse.json(
        { error: 'Error downloading the Whisper model. Please try again or select a smaller model.' },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: `Transcription failed: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}

/**
 * Handle local transcription with Whisper
 */
async function handleLocalTranscription(
  audioFilePath: string, 
  modelOption: string,
  tmpDir: string
): Promise<DetailedTranscription> {
  // Extract the base model name and whether to use GPU
  const isGpuModel = modelOption.endsWith('-gpu');
  const baseModelOption = isGpuModel ? modelOption.replace('-gpu', '') : modelOption;
  
  // Map the model name from our UI to the correct whisper model parameter
  const whisperModelMap: Record<string, string> = {
    'whisper-tiny': 'tiny',
    'whisper-base': 'base',
    'whisper-small': 'small',
    'whisper-medium': 'medium',
  };

  const model = whisperModelMap[baseModelOption] || 'tiny';
  
  // Check if model is downloaded, if not, inform the user about expected download
  const isDownloaded = await isModelDownloaded(model);
  
  if (!isDownloaded) {
    const downloadTime = estimateDownloadTime(model);
    console.log(`Model ${model} is not downloaded yet. It will be downloaded automatically (may take ${downloadTime}).`);
  }
  
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
  
  // Create detailed transcription from raw text
  const compactText = result.transcription.replace(/\n+/g, ' ').trim();
  const detailedTranscription = createSegmentsFromText(result.transcription);
  
  // Set the compact text
  detailedTranscription.text = compactText;
  
  // Add processing time information if available
  if (result.processingTime) {
    detailedTranscription.processingTime = result.processingTime;
    detailedTranscription.usedGpu = isGpuModel && !result.usedFallback;
  }
  
  // Clean up output file if it exists
  try {
    if (fs.existsSync(result.outputPath)) {
      fs.unlinkSync(result.outputPath);
    }
  } catch (err) {
    console.error('Error cleaning up output file:', err);
  }
  
  return detailedTranscription;
}

/**
 * Handle Groq API transcription
 */
async function handleGroqTranscription(
  buffer: Buffer, 
  filename: string,
  modelOption: string
): Promise<DetailedTranscription> {
  console.log(`Using Groq API for transcription with model: ${modelOption}`);
  
  try {
    const apiClient = createApiClient(modelOption);
    
    // Set a timeout for the Groq API transcription
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Groq API transcription timed out after ${GROQ_TIMEOUT_MS / 60000} minutes`));
      }, GROQ_TIMEOUT_MS);
    });
    
    // Race between transcription and timeout
    const result = await Promise.race([
      apiClient.transcribeAudio(buffer, filename),
      timeoutPromise
    ]);
    
    return result;
  } catch (error) {
    console.error('Error using Groq API:', error);
    
    // Provide more specific error details if available
    let errorMessage = 'Groq API transcription failed';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      console.log('Error details:', error);
      
      // Check for specific error patterns
      if (error.message.includes('404') && error.message.includes('does not exist')) {
        errorMessage = 'The specified Whisper model is not available in Groq. Please try another model.';
      } else if (error.message.includes('401') || error.message.includes('403')) {
        errorMessage = 'Authentication failed with Groq API. Please check your API key.';
      } else if (error.message.includes('429')) {
        errorMessage = 'Rate limit exceeded with Groq API. Please try again later.';
      }
    }
    
    throw new Error(errorMessage);
  }
} 