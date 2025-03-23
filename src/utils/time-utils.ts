/**
 * Formats seconds into a consistent "X min Y sec" format
 * @param totalSeconds Number of seconds to format
 * @param includeLabel Whether to include "Processing:" label (default: false)
 * @returns Formatted time string
 */
export function formatTime(totalSeconds: number, includeLabel: boolean = false): string {
  // Ensure we're dealing with integers
  const seconds = Math.floor(totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  const timeString = `${minutes}m ${remainingSeconds}s`;
  return includeLabel ? `Processing: ${timeString}...` : timeString;
}

/**
 * Create a completion message with time and device information
 * @param seconds Total processing time in seconds
 * @param deviceType Type of device used (CPU, GPU, Groq API, etc.)
 * @returns Formatted completion message
 */
export function formatCompletionTime(seconds: number, deviceType: string): string {
  return `Total processing: ${formatTime(seconds)} using ${deviceType}`;
}

/**
 * Create a split completion message with time
 * @param seconds Total splitting time in seconds
 * @returns Formatted splitting completion message
 */
export function formatSplitCompletionTime(seconds: number): string {
  return `Split completed in ${formatTime(seconds)}`;
}

/**
 * Create an extraction completion message with time
 * @param seconds Total extraction time in seconds
 * @returns Formatted extraction completion message
 */
export function formatExtractionCompletionTime(seconds: number): string {
  return `Extracted in ${formatTime(seconds)}`;
} 