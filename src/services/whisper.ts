import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { WhisperTranscriptionResult } from '@/types';

const execPromise = promisify(exec);

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
  const homeDir = os.homedir();
  const modelDir = path.join(homeDir, '.cache', 'whisper');
  const expectedModelPath = path.join(modelDir, `${model}.pt`);
  
  return fs.existsSync(expectedModelPath);
}

/**
 * Transcribes audio using Whisper
 */
export async function transcribeAudio(
  audioPath: string, 
  model: string = 'tiny',
  outputDir: string = os.tmpdir(),
  useGpu: boolean = false
): Promise<WhisperTranscriptionResult> {
  const env = {...process.env};
  env.PATH = `${env.PATH}:${os.homedir()}/Library/Python/3.9/bin`;
  
  // Create the whisper command
  // Detect if running on Apple Silicon (arm64) on macOS
  const isAppleSilicon = process.platform === 'darwin' && (os.arch() === 'arm64' || process.arch === 'arm64');

  let whisperCommand = "";
  if (isAppleSilicon && useGpu) {
    console.log('Running Whisper with MPS (GPU) acceleration on Apple Silicon using patched backend with fp16 disabled');
    // Use the patched script to work around sparse tensor issues
    const mpsScript = path.join(process.cwd(), 'whisper_mps.py');
    whisperCommand = `python3 "${mpsScript}" "${audioPath}" --model ${model} --output_dir "${outputDir}" --output_format txt --device mps --fp16 False --benchmark`;
  } else {
    console.log(`Running Whisper with CPU mode (${useGpu ? 'GPU requested but not available on this system' : 'CPU requested'})`);
    const whisperPath = path.join(os.homedir(), 'Library/Python/3.9/bin/whisper');
    whisperCommand = `${whisperPath} "${audioPath}" --model ${model} --output_dir "${outputDir}" --output_format txt --device cpu`;
  }
  
  try {
    const startTime = Date.now();
    const { stderr } = await execPromise(whisperCommand, { env });
    const endTime = Date.now();
    const processingTime = (endTime - startTime) / 1000; // in seconds
    
    console.log(`Whisper processing completed in ${processingTime.toFixed(2)} seconds`);
    
    if (stderr && !stderr.includes('100%')) {
      console.error('Whisper stderr:', stderr);
      
      // If GPU processing was too slow (more than 2x expected CPU time), try with CPU next time
      if (isAppleSilicon && processingTime > 120) { // Arbitrary threshold, adjust based on your observations
        console.warn('GPU processing was slower than expected. Consider using CPU for this model size.');
      }
    }
    
    // Get the output file path
    const fileExt = path.extname(audioPath);
    const transcriptionFilePath = audioPath.replace(fileExt, '.txt');
    
    // Read the transcription content
    const transcription = fs.existsSync(transcriptionFilePath) 
      ? fs.readFileSync(transcriptionFilePath, 'utf-8')
      : '';
    
    return {
      transcription,
      outputPath: transcriptionFilePath,
      processingTime
    };
  } catch (error) {
    console.error('Error transcribing audio:', error);
    
    // If GPU processing failed, fallback to CPU
    if (isAppleSilicon) {
      console.log('Falling back to CPU processing after GPU error');
      const whisperPath = path.join(os.homedir(), 'Library/Python/3.9/bin/whisper');
      const cpuCommand = `${whisperPath} "${audioPath}" --model ${model} --output_dir "${outputDir}" --output_format txt --device cpu`;
      
      try {
        const startTime = Date.now();
        const { stderr } = await execPromise(cpuCommand, { env });
        const endTime = Date.now();
        const processingTime = (endTime - startTime) / 1000; // in seconds
        
        console.log(`CPU fallback processing completed in ${processingTime.toFixed(2)} seconds`);
        
        if (stderr && !stderr.includes('100%')) {
          console.error('CPU fallback stderr:', stderr);
        }
        
        // Get the output file path
        const fileExt = path.extname(audioPath);
        const transcriptionFilePath = audioPath.replace(fileExt, '.txt');
        
        // Read the transcription content
        const transcription = fs.existsSync(transcriptionFilePath) 
          ? fs.readFileSync(transcriptionFilePath, 'utf-8')
          : '';
        
        return {
          transcription,
          outputPath: transcriptionFilePath,
          processingTime,
          usedFallback: true
        };
      } catch (fallbackError) {
        console.error('Error in CPU fallback:', fallbackError);
        throw fallbackError;
      }
    }
    
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