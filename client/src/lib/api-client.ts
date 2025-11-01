import OpenAI from 'openai';
import { ApiClient, DetailedTranscription, TranscriptionSegment } from '@shared/types';
import { createSegmentsFromText } from '@/lib/utils';
import { AudioPart } from '@/lib/audio-utils';
// Import Node.js modules used in GroqClient server-side logic
import fs from 'fs';
import path from 'path';
import os from 'os';

// Simple logger for client-side (use console instead of pino)
const logger = {
  info: (...args: any[]) => console.log(...args),
  debug: (...args: any[]) => console.debug(...args),
  warn: (...args: any[]) => console.warn(...args),
  error: (...args: any[]) => console.error(...args),
};

// Standardized base temporary directory
const BASE_TEMP_DIR = path.join(os.tmpdir(), "transcriptor-temp");

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
    // - whisper-large-v3-turbo (Faster multilingual)
    const modelMap: Record<string, string> = {
      'groq-distil-whisper': 'distil-whisper-large-v3-en',
      'groq-whisper-large-v3': 'whisper-large-v3',
      'groq-whisper-large-v3-turbo': 'whisper-large-v3-turbo'
    };

    // Validate the model is supported
    if (!modelMap[model]) {
      logger.error({ model }, `[GroqClient] Unsupported Groq model requested`);
      throw new Error(`Unsupported Groq model: "${model}". Valid options are: ${Object.keys(modelMap).join(', ')}`);
    }

    this.model = modelMap[model];
    
    logger.debug({ requestedModel: model, mappedModel: this.model }, `[GroqClient] Initialized`);
    
    this.client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY || '',
      baseURL: process.env.GROQ_API_BASE_URL || 'https://api.groq.com/openai/v1'
    });
  }

  async transcribeAudio(audioData: Buffer, filename: string): Promise<DetailedTranscription> {
    logger.info({ filename, model: this.model }, `[GroqClient] Starting transcription`);
    
    if (!process.env.GROQ_API_KEY) {
      logger.error('[GroqClient] GROQ_API_KEY is not set');
      throw new Error('[GroqClient] GROQ_API_KEY is not set in environment variables.');
    }

    // Ensure the base temp directory exists
    if (!fs.existsSync(BASE_TEMP_DIR)) {
      try {
        logger.debug(`[GroqClient] Creating base temp directory: ${BASE_TEMP_DIR}`);
        fs.mkdirSync(BASE_TEMP_DIR, { recursive: true });
      } catch (err) {
        if (!fs.existsSync(BASE_TEMP_DIR)) {
             logger.error({ path: BASE_TEMP_DIR, error: err }, '[GroqClient] Failed to create base temp directory');
             throw err; // Re-throw if creation failed
        }
        // Ignore error if it already exists (race condition)
        logger.warn(`[GroqClient] Base temp directory already existed despite check: ${BASE_TEMP_DIR}`);
      }
    }
    
    // Create a unique temporary file path within the standardized directory
    const safeFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const tempFilePath = path.join(BASE_TEMP_DIR, `groq_${Date.now()}_${safeFilename}`);
    let transcription: any;

    try {
      // Write buffer to temporary file
      fs.writeFileSync(tempFilePath, audioData);
      logger.debug(`[GroqClient] Temporary file created: ${tempFilePath}`);

      // Create a read stream for the API call
      const fileStream = fs.createReadStream(tempFilePath);

      // Call the Groq API
      logger.debug(`[GroqClient] Calling Groq API...`);
      transcription = await this.client.audio.transcriptions.create({
        file: fileStream,
        model: this.model,
        response_format: 'verbose_json'
      });
      
      logger.info(`[GroqClient] Groq transcription successful`);
      
      // Convert the Groq response
      const result: DetailedTranscription = {
        text: transcription.text || '',
        language: transcription.language || 'en',
        segments: transcription.segments || [],
        processingTime: 0 // Groq doesn't provide processing time
      };
      
      // Segment fallback
      if (!result.segments || result.segments.length === 0) {
        logger.warn('[GroqClient] No segments in Groq response, creating from text.');
        result.segments = createSegmentsFromText(result.text).segments;
      }
      
      return result;

    } catch (error) {
       logger.error({ filename, model: this.model, error }, '[GroqClient] Error during Groq API call or processing');
       // Re-throw the error to be handled by the transcription service
       throw error;
    } finally {
      // Clean up the temporary file
      if (fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
          logger.debug(`[GroqClient] Cleaned up temporary file: ${tempFilePath}`);
        } catch (cleanupErr) {
          logger.warn({ path: tempFilePath, error: cleanupErr }, `[GroqClient] Error cleaning up temp file`);
        }
      }
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
  
  throw new Error(`Unsupported API client type for model: ${model}`);
} 