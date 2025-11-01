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
 * These correspond to the FFmpeg -q:a values and specific bitrates
 */
export enum MP3Quality {
  HIGH = 1,      // High quality (roughly equivalent to 220-260 kbps)
  KBPS_192 = 2,  // 192 kbps
  KBPS_128 = 3,  // 128 kbps
  LOW = 5,       // Low quality (roughly equivalent to 120-150 kbps)
  KBPS_64 = 8,   // 64 kbps
  KBPS_32 = 9,   // 32 kbps
  VERY_LOW = 7   // Very low quality (roughly equivalent to 80-100 kbps)
}

// Human-friendly labels for MP3 quality levels
export const MP3QualityLabels = {
  [MP3Quality.HIGH]: "High (VBR ~220-260 kbps)",
  [MP3Quality.KBPS_192]: "192 kbps",
  [MP3Quality.KBPS_128]: "128 kbps",
  [MP3Quality.LOW]: "Low (VBR ~120-150 kbps)",
  [MP3Quality.KBPS_64]: "64 kbps",
  [MP3Quality.KBPS_32]: "32 kbps",
  [MP3Quality.VERY_LOW]: "Very Low (VBR ~80-100 kbps)"
};

// Descriptions for each quality level
export const MP3QualityDescriptions = {
  [MP3Quality.HIGH]: "High quality audio with minimal compression artifacts",
  [MP3Quality.KBPS_192]: "Good quality with reasonable file size (192 kbps)",
  [MP3Quality.KBPS_128]: "Standard quality, good for most speech content (128 kbps)",
  [MP3Quality.LOW]: "Acceptable quality for speech content, smaller files",
  [MP3Quality.KBPS_64]: "Reduced quality, very small files (64 kbps)",
  [MP3Quality.KBPS_32]: "Minimum quality, smallest files (32 kbps)",
  [MP3Quality.VERY_LOW]: "Minimum quality for intelligible speech, smallest files"
};

// Estimated average bitrates for each quality level (for UI display only)
export const MP3QualityBitrates = {
  [MP3Quality.HIGH]: 240000,    // ~240 kbps
  [MP3Quality.KBPS_192]: 192000, // 192 kbps
  [MP3Quality.KBPS_128]: 128000, // 128 kbps
  [MP3Quality.LOW]: 130000,     // ~130 kbps
  [MP3Quality.KBPS_64]: 64000,  // 64 kbps
  [MP3Quality.KBPS_32]: 32000,  // 32 kbps
  [MP3Quality.VERY_LOW]: 90000  // ~90 kbps
};

// Default quality to use when not specified
export const DEFAULT_MP3_QUALITY = MP3Quality.KBPS_64;

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
  quality: MP3Quality = MP3Quality.LOW,
  onProgress?: (progress: number) => void
): Promise<AudioPart[]> {
  try {
    console.log(`Starting to split ${file.name} (${formatFileSize(file.size)}) into ${numParts} parts with FFmpeg, quality level: ${quality}`);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('numParts', numParts.toString());
    formData.append('quality', quality.toString());
    
    const response = await fetch('/api/audio/split', {
      method: 'POST',
      body: formData
    });
    
    // Improved error handling for non-OK responses
    if (!response.ok) {
      let errorDetail = `Server error processing audio (status ${response.status})`;
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          errorDetail = errorData.error || errorData.message || errorDetail; 
        } else {
          // If not JSON, try to get text, but limit length
          const textResponse = await response.text();
          errorDetail = `${errorDetail}: ${textResponse.substring(0, 200)}${textResponse.length > 200 ? '...' : ''}`;
        }
      } catch (parseError) {
        // Ignore parsing errors if the response wasn't JSON or text reading failed
        console.error("Could not parse error response:", parseError);
        errorDetail = `${errorDetail} (Could not parse response body)`;
      }
      throw new Error(errorDetail);
    }
    
    // Parse the SUCCESS response data (assuming JSON)
    const result = await response.json();
    
    if (!result.success || !result.parts || !Array.isArray(result.parts)) {
      throw new Error('Invalid success response from server');
    }
    
    console.log(`Received ${result.parts.length} split parts from server, total size: ${formatFileSize(result.totalSize)}`);
    
    // Convert the base64 data to blobs and create URL objects
    const audioParts: AudioPart[] = [];
    
    for (let i = 0; i < result.parts.length; i++) {
      const part = result.parts[i];
      
      // Calculate progress percentage
      if (onProgress) {
        const progress = Math.round((i / result.parts.length) * 100);
        onProgress(progress);
      }
      
      // Convert base64 to binary
      const binaryString = atob(part.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let j = 0; j < binaryString.length; j++) {
        bytes[j] = binaryString.charCodeAt(j);
      }
      
      // Create blob
      const blob = new Blob([bytes], { type: 'audio/mpeg' });
      
      // Create URL
      const url = URL.createObjectURL(blob);
      
      audioParts.push({
        blob,
        name: part.name,
        size: part.size,
        duration: part.duration,
        url
      });
    }
    
    // Set final progress to 100%
    if (onProgress) {
      onProgress(100);
    }
    
    return audioParts;
  } catch (error) {
    console.error("Error splitting audio:", error);
    // Ensure the error thrown includes the detail captured above
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Failed to split audio:")) { // Avoid double prefixing
      throw error;
    }
    throw new Error(`Failed to split audio: ${message}`);
  }
}

/**
 * Get audio file duration in seconds
 */
export function getAudioDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    
    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration === Infinity) {
        // Some browsers initially return Infinity for duration, need to start playback to get actual duration
        audio.currentTime = 1e101;
        audio.addEventListener('timeupdate', function getDuration() {
          if (audio.duration !== Infinity) {
            audio.removeEventListener('timeupdate', getDuration);
            resolve(audio.duration);
          }
        });
      } else {
        resolve(audio.duration);
      }
    });
    
    audio.addEventListener('error', (e) => {
      reject(new Error(`Error loading audio: ${e.message}`));
    });
    
    audio.src = url;
    audio.load();
  });
}