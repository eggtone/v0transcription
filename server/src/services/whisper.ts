import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import fs from 'fs';
import logger from '@server/lib/logger';
import { WhisperTranscriptionResult } from '@shared/types';

const execPromise = promisify(exec);

// --- Configuration from Environment Variables with Defaults ---
const WHISPER_EXECUTABLE_PATH = process.env.WHISPER_EXECUTABLE_PATH || 'whisper';
const WHISPER_MPS_SCRIPT_PATH = process.env.WHISPER_MPS_SCRIPT_PATH || path.join(process.cwd(), 'whisper_mps.py');
const WHISPER_PYTHON_EXECUTABLE = process.env.WHISPER_PYTHON_EXECUTABLE || 'python3';
const WHISPER_CACHE_DIR = process.env.WHISPER_CACHE_DIR || path.join(os.homedir(), '.cache', 'whisper');
logger.info({
  executable: WHISPER_EXECUTABLE_PATH,
  mpsScript: WHISPER_MPS_SCRIPT_PATH,
  python: WHISPER_PYTHON_EXECUTABLE,
  cacheDir: WHISPER_CACHE_DIR
}, 'Whisper Service Configuration Loaded');
// --- End Configuration ---

// Define model sizes in bytes (approximate)
const MODEL_SIZES = {
  tiny: 150_000_000,   // ~150MB
  base: 300_000_000,   // ~300MB
  small: 950_000_000,  // ~950MB
  medium: 3_000_000_000, // ~3GB
  large: 6_000_000_000,  // ~6GB
};

/**
 * Checks if a Whisper model is already downloaded
 */
export async function isModelDownloaded(model: string): Promise<boolean> {
  // Use configured cache directory
  const expectedModelPath = path.join(WHISPER_CACHE_DIR, `${model}.pt`);
  
  const exists = fs.existsSync(expectedModelPath);
  logger.debug({ model, path: expectedModelPath, exists }, 'Checked Whisper model download status');
  return exists;
}

/**
 * Transcribes audio using Whisper
 */
export async function transcribeAudio(
  audioPath: string, 
  model: string = 'tiny',
  outputDir: string = os.tmpdir(), // Default output dir, often overridden by caller
  useGpu: boolean = false
): Promise<WhisperTranscriptionResult> {
  // Remove PATH modification - rely on system PATH or configured paths
  // const env = {...process.env};
  // env.PATH = `${env.PATH}:${os.homedir()}/Library/Python/3.9/bin`;
  
  // Create the whisper command
  // Detect if running on Apple Silicon (arm64) on macOS
  const isAppleSilicon = process.platform === 'darwin' && (os.arch() === 'arm64' || process.arch === 'arm64');

  let whisperCommand = "";
  let device = 'cpu';
  
  // Use configured paths
  if (isAppleSilicon && useGpu) {
    device = 'mps';
    // Check if MPS script exists before attempting to use it
    if (!fs.existsSync(WHISPER_MPS_SCRIPT_PATH)) {
       logger.error({ path: WHISPER_MPS_SCRIPT_PATH }, 'Whisper MPS script not found. Check WHISPER_MPS_SCRIPT_PATH env var or ensure script exists.');
       throw new Error(`Whisper MPS script not found at ${WHISPER_MPS_SCRIPT_PATH}`);
    }
    whisperCommand = `"${WHISPER_PYTHON_EXECUTABLE}" "${WHISPER_MPS_SCRIPT_PATH}" "${audioPath}" --model ${model} --output_dir "${outputDir}" --output_format json --device mps --fp16 False --benchmark`;
    logger.info({ model, device, command: `${WHISPER_PYTHON_EXECUTABLE} ${path.basename(WHISPER_MPS_SCRIPT_PATH)}` }, 'Using Apple Silicon GPU (MPS) Whisper command');
  } else {
    device = 'cpu';
    // Using configured executable path
    whisperCommand = `"${WHISPER_EXECUTABLE_PATH}" "${audioPath}" --model ${model} --output_dir "${outputDir}" --output_format json --device cpu`;
    logger.info({ model, device, command: WHISPER_EXECUTABLE_PATH }, 'Using CPU Whisper command');
  }
  
  try {
    const startTime = Date.now();
    logger.debug({ command: whisperCommand }, 'Executing Whisper command');
    // Execute without modified env unless specific vars are needed later
    const { stderr } = await execPromise(whisperCommand); 
    const endTime = Date.now();
    const processingTime = (endTime - startTime) / 1000; // in seconds
    
    logger.info({ model, device, processingTime }, `Whisper processing completed`);
    
    if (stderr && !stderr.includes('100%') && !stderr.includes('Detected language')) {
      logger.warn({ stderr }, 'Whisper process produced stderr output');
    }
    
    // Get the output file path
    const inputFileBase = path.parse(audioPath).name;
    const transcriptionFilePath = path.join(outputDir, `${inputFileBase}.json`);
    
    logger.debug({ path: transcriptionFilePath }, 'Reading Whisper JSON output');
    let transcription = '';
    let segments = [];
    
    if (fs.existsSync(transcriptionFilePath)) {
      try {
        const jsonContent = fs.readFileSync(transcriptionFilePath, 'utf-8');
        const jsonData = JSON.parse(jsonContent);
        
        // Extract the full text
        transcription = jsonData.text || '';
        
        // Extract segments with timestamps
        segments = jsonData.segments || [];
        
        logger.debug({ segmentsCount: segments.length }, `Parsed JSON transcription`);
      } catch (parseError) {
        logger.error({ path: transcriptionFilePath, error: parseError }, 'Error parsing Whisper JSON output');
        // Keep transcription empty, let service layer handle segment fallback
      }
    } else {
      logger.warn({ path: transcriptionFilePath }, 'Whisper JSON output file not found');
    }
    
    return {
      transcription,
      segments,
      outputPath: transcriptionFilePath,
      processingTime
    };
  } catch (error) {
    logger.error({ model, device, error }, 'Error executing Whisper command');
    
    // If GPU processing failed, fallback to CPU
    if (isAppleSilicon && device === 'mps') { // Only fallback if MPS was attempted
      logger.warn({ model }, 'GPU execution failed, attempting CPU fallback');
      // Use configured CPU executable path for fallback
      const cpuCommand = `"${WHISPER_EXECUTABLE_PATH}" "${audioPath}" --model ${model} --output_dir "${outputDir}" --output_format json --device cpu`;
      
      try {
        const startTime = Date.now();
        logger.debug({ command: cpuCommand }, 'Executing Whisper CPU fallback command');
        // Execute without modified env
        const { stderr: fallbackStderr } = await execPromise(cpuCommand); 
        const endTime = Date.now();
        const fallbackProcessingTime = (endTime - startTime) / 1000;
        
        logger.info({ model, device: 'cpu', processingTime: fallbackProcessingTime }, `CPU fallback processing completed`);
        
        if (fallbackStderr && !fallbackStderr.includes('100%') && !fallbackStderr.includes('Detected language')) {
          logger.warn({ stderr: fallbackStderr }, 'Whisper CPU fallback produced stderr output');
        }
        
        // Get the output file path
        const inputFileBase = path.parse(audioPath).name;
        const fallbackTranscriptionFilePath = path.join(outputDir, `${inputFileBase}.json`);
        
        logger.debug({ path: fallbackTranscriptionFilePath }, 'Reading Whisper fallback JSON output');
        let fallbackTranscription = '';
        let fallbackSegments = [];
        
        if (fs.existsSync(fallbackTranscriptionFilePath)) {
          try {
            const jsonContent = fs.readFileSync(fallbackTranscriptionFilePath, 'utf-8');
            const jsonData = JSON.parse(jsonContent);
            
            // Extract the full text
            fallbackTranscription = jsonData.text || '';
            
            // Extract segments with timestamps
            fallbackSegments = jsonData.segments || [];
            
            logger.debug({ segmentsCount: fallbackSegments.length }, `Parsed fallback JSON transcription`);
          } catch (parseError) {
            logger.error({ path: fallbackTranscriptionFilePath, error: parseError }, 'Error parsing Whisper fallback JSON output');
          }
        } else {
          logger.warn({ path: fallbackTranscriptionFilePath }, 'Whisper fallback JSON output file not found');
        }
        
        return {
          transcription: fallbackTranscription,
          segments: fallbackSegments,
          outputPath: fallbackTranscriptionFilePath,
          processingTime: fallbackProcessingTime,
          usedFallback: true
        };
      } catch (fallbackError) {
        logger.error({ model, error: fallbackError }, 'Error during Whisper CPU fallback execution');
        // If fallback also fails, throw the fallback error
        throw fallbackError;
      }
    }
    
    // If not Apple Silicon or fallback already failed, re-throw original error
    throw error;
  }
}

/**
 * Estimate download time for a model based on estimated size and typical download speed
 */
export function estimateDownloadTime(model: string): string {
  const modelSize = MODEL_SIZES[model as keyof typeof MODEL_SIZES] || MODEL_SIZES.tiny;
  
  // Assume average download speed of 10MB/s
  const downloadSpeedMBps = 10 * 1024 * 1024;
  const estimatedSeconds = modelSize / downloadSpeedMBps;
  
  // Format the time estimate
  if (estimatedSeconds < 60) {
    return `about ${Math.ceil(estimatedSeconds)} seconds`;
  } else if (estimatedSeconds < 3600) {
    return `about ${Math.ceil(estimatedSeconds / 60)} minutes`;
  } else {
    return `about ${(estimatedSeconds / 3600).toFixed(1)} hours`;
  }
} 