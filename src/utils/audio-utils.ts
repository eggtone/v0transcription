/**
 * Utility functions for audio processing
 */

/**
 * Format file size to human-readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Check if a file size is within Groq's limit (20MB)
 */
export function isWithinGroqSizeLimit(bytes: number): boolean {
  const GROQ_SIZE_LIMIT = 20 * 1024 * 1024; // 20MB in bytes
  return bytes <= GROQ_SIZE_LIMIT;
}

/**
 * Interface for split audio parts
 */
export interface AudioPart {
  blob: Blob;
  name: string;
  size: number;
  duration: number;
  url: string;
}

/**
 * Quality settings for MP3 Variable Bitrate (VBR)
 * These correspond to the FFmpeg -q:a values
 */
export enum MP3Quality {
  HIGH = 1,      // High quality (roughly equivalent to 220-260 kbps)
  MEDIUM = 2,    // Medium quality (roughly equivalent to 170-210 kbps)
  LOW = 5,       // Low quality (roughly equivalent to 120-150 kbps)
  VERY_LOW = 7   // Very low quality (roughly equivalent to 80-100 kbps)
}

// Human-friendly labels for MP3 quality levels
export const MP3QualityLabels = {
  [MP3Quality.HIGH]: "High (VBR ~220-260 kbps)",
  [MP3Quality.MEDIUM]: "Medium (VBR ~170-210 kbps)",
  [MP3Quality.LOW]: "Low (VBR ~120-150 kbps)",
  [MP3Quality.VERY_LOW]: "Very Low (VBR ~80-100 kbps)"
};

// Descriptions for each quality level
export const MP3QualityDescriptions = {
  [MP3Quality.HIGH]: "High quality audio with minimal compression artifacts",
  [MP3Quality.MEDIUM]: "Good quality for most content, balanced file size",
  [MP3Quality.LOW]: "Acceptable quality for speech content, smaller files",
  [MP3Quality.VERY_LOW]: "Minimum quality for intelligible speech, smallest files"
};

// Estimated average bitrates for each quality level (for UI display only)
export const MP3QualityBitrates = {
  [MP3Quality.HIGH]: 240000,    // ~240 kbps
  [MP3Quality.MEDIUM]: 190000,  // ~190 kbps
  [MP3Quality.LOW]: 130000,     // ~130 kbps
  [MP3Quality.VERY_LOW]: 90000  // ~90 kbps
};

/**
 * Audio format options
 */
export enum AudioFormat {
  MP3 = 'mp3',
  WEBM = 'webm', 
  WAV = 'wav'
}

// Map AudioFormat to MIME types
export const AudioFormatMimeTypes = {
  [AudioFormat.MP3]: 'audio/mpeg',
  [AudioFormat.WEBM]: 'audio/webm;codecs=opus',
  [AudioFormat.WAV]: 'audio/wav'
};

/**
 * Split an audio file into multiple parts using server-side FFmpeg
 */
export async function splitAudioFile(
  file: File, 
  numParts: number,
  quality: MP3Quality = MP3Quality.LOW
): Promise<AudioPart[]> {
  try {
    console.log(`Starting to split ${file.name} (${formatFileSize(file.size)}) into ${numParts} parts with FFmpeg, quality level: ${quality}`);
    
    // Create form data for the API request
    const formData = new FormData();
    formData.append('file', file);
    formData.append('numParts', numParts.toString());
    formData.append('quality', quality.toString());
    
    // Call the server-side API endpoint to perform the splitting
    const response = await fetch('/api/audio/split', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Server error processing audio');
    }
    
    // Parse the response data
    const result = await response.json();
    
    if (!result.success || !result.parts || !Array.isArray(result.parts)) {
      throw new Error('Invalid response from server');
    }
    
    console.log(`Received ${result.parts.length} split parts from server, total size: ${formatFileSize(result.totalSize)}`);
    
    // Convert the base64 data to blobs and create URL objects
    const audioParts: AudioPart[] = result.parts.map((part: any) => {
      // Convert base64 to binary
      const binaryString = atob(part.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Create blob
      const blob = new Blob([bytes], { type: 'audio/mpeg' });
      
      // Create URL
      const url = URL.createObjectURL(blob);
      
      return {
        blob,
        name: part.name,
        size: part.size,
        duration: part.duration,
        url
      };
    });
    
    return audioParts;
  } catch (error) {
    console.error("Error splitting audio:", error);
    throw new Error(`Failed to split audio: ${error instanceof Error ? error.message : String(error)}`);
  }
}