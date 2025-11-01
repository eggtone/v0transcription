/**
 * @module transcription-service
 * 
 * Orchestrates audio transcription by selecting the appropriate service 
 * (local Whisper or Groq API) based on the chosen model option.
 * Handles timeouts, model mapping, and basic error handling/translation.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DetailedTranscription } from '@/types';
import { createSegmentsFromText } from '@/utils';
import logger from '@/utils/logger'; // Import the logger
import { 
  transcribeAudio as transcribeWithWhisper, 
  isModelDownloaded, 
  estimateDownloadTime 
} from '@/services/whisper';
import { createApiClient } from '@/services/api-client';

// Centralized configuration (Consider moving to src/config.ts later)
const LOCAL_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes for local models
const GROQ_TIMEOUT_MS = 15 * 60 * 1000;  // 15 minutes for Groq models
const WHISPER_MODEL_MAP: Record<string, string> = {
  'whisper-tiny': 'tiny',
  'whisper-base': 'base',
  'whisper-small': 'small',
  'whisper-medium': 'medium',
};

/**
 * Creates a timeout promise that rejects after a specified duration.
 */
function createTimeoutPromise<T>(timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((_, reject) => {
    setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });
}

/**
 * Orchestrates the transcription process, choosing between local Whisper and Groq API.
 * 
 * @param audioFilePath Absolute path to the temporary audio file.
 * @param originalFilename Original filename (used for Groq).
 * @param modelOption The model option selected by the user (e.g., 'whisper-small-gpu', 'groq-whisper-large-v3').
 * @param tempDir Path to the temporary directory for processing.
 * @returns The detailed transcription result.
 * @throws Error if transcription fails or times out.
 */
export async function runTranscription(
  audioFilePath: string,
  originalFilename: string,
  modelOption: string,
  tempDir: string // Used by local whisper for output
): Promise<DetailedTranscription> {
  
  logger.info(
    { filename: originalFilename, model: modelOption, path: audioFilePath }, 
    `[TranscriptionService] Running transcription`
  );

  if (modelOption.startsWith('whisper-')) {
    return await runLocalWhisperTranscription(audioFilePath, modelOption, tempDir);
  } else if (modelOption.startsWith('groq-')) {
    // Groq needs the audio data as a buffer
    const audioBuffer = fs.readFileSync(audioFilePath);
    return await runGroqTranscription(audioBuffer, originalFilename, modelOption);
  } else {
    logger.error({ model: modelOption }, `[TranscriptionService] Unknown model option`);
    throw new Error(`Unknown model option: ${modelOption}`);
  }
}

/**
 * Handles local transcription using the whisper service.
 * 
 * @param {string} audioFilePath Absolute path to the temporary audio file.
 * @param {string} modelOption The user-selected model option (e.g., 'whisper-small').
 * @param {string} tempDir Path to the temporary directory for Whisper output.
 * @returns {Promise<DetailedTranscription>} The transcription result from local Whisper.
 * @throws Error if local Whisper transcription fails, times out, or the model download fails.
 */
async function runLocalWhisperTranscription(
  audioFilePath: string, 
  modelOption: string,
  tempDir: string
): Promise<DetailedTranscription> {
  const isGpuModel = modelOption.endsWith('-gpu');
  const baseModelOption = isGpuModel ? modelOption.replace('-gpu', '') : modelOption;
  const model = WHISPER_MODEL_MAP[baseModelOption] || 'tiny'; // Default to tiny if map fails

  logger.info({ model, useGpu: isGpuModel }, `[TranscriptionService] Using local Whisper`);

  // Check if model is downloaded (log only, actual download handled by whisper script)
  const isDownloaded = await isModelDownloaded(model);
  if (!isDownloaded) {
    const downloadTime = estimateDownloadTime(model);
    logger.info({ model, estimatedTime: downloadTime }, `[TranscriptionService] Whisper model needs download.`);
  }

  const timeoutMessage = `Local transcription timed out after ${LOCAL_TIMEOUT_MS / 60000} minutes`;
  
  try {
    // Start transcription and timeout concurrently
    const result = await Promise.race([
      transcribeWithWhisper(audioFilePath, model, tempDir, isGpuModel),
      createTimeoutPromise<never>(LOCAL_TIMEOUT_MS, timeoutMessage)
    ]);

    logger.info(
      { model, processingTime: result.processingTime, fallback: result.usedFallback },
      `[TranscriptionService] Local Whisper completed.`
    );

    // Ensure segments exist
    let finalSegments = result.segments;
    if (!finalSegments || finalSegments.length === 0) {
      logger.warn({ model }, '[TranscriptionService] No segments from Whisper, creating from text.');
      finalSegments = createSegmentsFromText(result.transcription).segments;
    }

    // Clean up Whisper's output file (JSON)
    try {
      if (result.outputPath && fs.existsSync(result.outputPath)) {
        fs.unlinkSync(result.outputPath);
      }
    } catch (err) {
      // Log cleanup error but don't fail the transcription
      logger.warn({ path: result.outputPath, error: err }, '[TranscriptionService] Error cleaning up Whisper output file');
    }

    return {
      text: result.transcription,
      segments: finalSegments,
      language: 'en', // Whisper result doesn't include language, default to 'en' for now
      processingTime: result.processingTime,
      usedGpu: isGpuModel && !result.usedFallback,
    };

  } catch (error) {
    logger.error({ model, error }, '[TranscriptionService] Error during local Whisper transcription');
    // Handle specific model download error message
    const message = (error as Error).message;
    if (message.includes('No such file or directory') && message.includes('.pt')) {
      throw new Error('Error downloading the Whisper model. Please check network or select a smaller model.');
    }
    throw error; // Rethrow other errors
  }
}

/**
 * Handles transcription using the Groq API via the ApiClient.
 * 
 * @param {Buffer} audioBuffer Buffer containing the audio data.
 * @param {string} filename Original filename for the audio.
 * @param {string} modelOption The user-selected Groq model option (e.g., 'groq-whisper-large-v3').
 * @returns {Promise<DetailedTranscription>} The transcription result from the Groq API.
 * @throws Error if the Groq API call fails, times out, or encounters authentication/rate limit issues.
 */
async function runGroqTranscription(
  audioBuffer: Buffer, 
  filename: string,
  modelOption: string
): Promise<DetailedTranscription> {
  logger.info({ filename, model: modelOption }, `[TranscriptionService] Using Groq API`);
  
  const timeoutMessage = `Groq API transcription timed out after ${GROQ_TIMEOUT_MS / 60000} minutes`;

  try {
    // Note: createApiClient is designed for server-side use and returns GroqClient
    const apiClient = createApiClient(modelOption); 

    // Start transcription and timeout concurrently
    // apiClient.transcribeAudio handles the actual Groq API call (server-side part)
    const result = await Promise.race([
      apiClient.transcribeAudio(audioBuffer, filename), 
      createTimeoutPromise<never>(GROQ_TIMEOUT_MS, timeoutMessage)
    ]);

    logger.info({ filename, model: modelOption }, `[TranscriptionService] Groq API transcription completed.`);

    // GroqClient's transcribeAudio already ensures segments exist via fallback
    return result;

  } catch (error) {
    logger.error({ filename, model: modelOption, error }, '[TranscriptionService] Error during Groq API transcription');
    // Enhance common Groq error messages
    let errorMessage = `Groq API transcription failed: ${(error as Error).message}`;
    if (error instanceof Error) {
        if (error.message.includes('404') && error.message.includes('does not exist')) {
            errorMessage = `The specified model (${modelOption}) is not available in Groq.`;
        } else if (error.message.includes('401') || error.message.includes('403')) {
            errorMessage = 'Authentication failed with Groq API. Check your GROQ_API_KEY.';
        } else if (error.message.includes('429')) {
            errorMessage = 'Rate limit exceeded with Groq API. Please try again later.';
        } else if (error.message.includes('GROQ_API_KEY is not set')) {
            errorMessage = 'Groq API Key is missing in server environment variables.';
        } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED') || 
                  error.message.includes('network') || error.message.includes('Failed to fetch')) {
            errorMessage = 'Connection error while trying to reach Groq API. Please check your internet connection.';
        } else if (error.message.includes('Unsupported Groq model')) {
            errorMessage = error.message; // Already formatted well
        }
    }
    throw new Error(errorMessage);
  }
} 