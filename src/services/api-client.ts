import OpenAI from 'openai';
import { ApiClient, DetailedTranscription, TranscriptionSegment } from '@/types';
import { createSegmentsFromText } from '@/utils';
import { AudioPart } from '@/utils/audio-utils';

/**
 * Transcribe audio using either the server API or directly with client-side libraries
 * This is the main function that will be used by the UI
 */
export async function transcribeAudio(
  source: File | AudioPart[] | null,
  model: string,
  language: string = 'en',
  onProgress?: (progress: number) => void
): Promise<DetailedTranscription> {
  if (!source) {
    throw new Error('No audio source provided');
  }

  try {
    // Set initial progress if callback provided
    if (onProgress) onProgress(10);
    
    // Determine if we're dealing with parts or a single file
    if (Array.isArray(source)) {
      // Handle audio parts - this requires server-side processing
      // This should be handled by processAudioParts in audio-split-utils.ts
      // Here we just throw an informative error
      throw new Error('Audio parts should be processed using processSplitAudioParts utility');
    } else {
      // Single file case
      console.log(`Transcribing single file: ${source.name} with model: ${model}`);
      
      const formData = new FormData();
      formData.append("file", source);
      formData.append("model", model);
      formData.append("language", language);
      
      // Update progress
      if (onProgress) onProgress(20);
      
      // Make a request to our API endpoint
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to transcribe audio");
      }
      
      // Update progress
      if (onProgress) onProgress(80);

      const data = await response.json();
      
      // Ensure we have segments - create them if not provided
      if (!data.transcription.segments || data.transcription.segments.length === 0) {
        console.log('No segments in response, creating from text');
        const textSegments = createSegmentsFromText(data.transcription.text);
        data.transcription.segments = textSegments.segments;
      }
      
      // Complete progress
      if (onProgress) onProgress(100);
      
      return data.transcription;
    }
  } catch (error) {
    console.error('Error in transcribeAudio:', error);
    throw error;
  }
}

/**
 * Groq client for whisper models
 * Note: This client runs on the server side only
 */
export class GroqClient implements ApiClient {
  private client: OpenAI;
  private model: string;

  constructor(model: string) {
    // Map from our UI model names to Groq model names
    // According to Groq docs, only these models are supported:
    // - distil-whisper-large-v3-en (English only)
    // - whisper-large-v3 (Multilingual)
    const modelMap: Record<string, string> = {
      'groq-distill-whisper': 'distil-whisper-large-v3-en',
      'groq-whisper-large-v3': 'whisper-large-v3',
      'groq-whisper-large': 'whisper-large-v3' // Fallback to v3 as v2 is not listed in docs
    };

    this.model = modelMap[model] || 'whisper-large-v3';
    
    console.log(`Mapped model ${model} to Groq model: ${this.model}`);
    
    this.client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY || '',
      baseURL: process.env.GROQ_API_BASE_URL || 'https://api.groq.com/openai/v1'
    });
  }

  async transcribeAudio(audioData: Buffer, filename: string): Promise<DetailedTranscription> {
    try {
      console.log(`Using Groq with model: ${this.model}`);
      
      if (!process.env.GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY is not set. Please add it to your environment variables.');
      }
      
      // We need to convert the buffer to a format that OpenAI client can use
      // For Node.js environment, we can create a ReadStream from the buffer
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      
      // Create a temporary file to store the audio data
      const tempDir = path.join(os.tmpdir(), 'groq-temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const tempFilePath = path.join(tempDir, filename);
      fs.writeFileSync(tempFilePath, audioData);
      
      try {
        // Call the Groq API to transcribe the audio using the file path
        const transcription = await this.client.audio.transcriptions.create({
          file: fs.createReadStream(tempFilePath),
          model: this.model,
          response_format: 'verbose_json'
        });
        
        console.log('Groq transcription complete');
        
        // Convert the Groq response to our DetailedTranscription format
        const result: DetailedTranscription = {
          text: transcription.text,
          language: transcription.language || 'en',
          segments: transcription.segments || [],
          processingTime: 0  // Groq doesn't provide processing time
        };
        
        // If no segments, create them from the text
        if (!result.segments || result.segments.length === 0) {
          console.log('No segments in Groq response, creating from text');
          const textSegments = createSegmentsFromText(result.text);
          result.segments = textSegments.segments;
        }
        
        return result;
      } finally {
        // Clean up the temporary file
        try {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        } catch (cleanupErr) {
          console.error('Error cleaning up temp file:', cleanupErr);
        }
      }
    } catch (error) {
      console.error('Error transcribing with Groq:', error);
      throw error;
    }
  }
}

/**
 * Factory function to create the appropriate client based on the model
 * Note: This should only be used server-side
 */
export function createApiClient(model: string): ApiClient {
  if (model.startsWith('groq-')) {
    return new GroqClient(model);
  }
  
  throw new Error(`Unsupported model type: ${model}`);
} 