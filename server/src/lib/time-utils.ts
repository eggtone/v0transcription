/**
 * Formats seconds into a human-readable time format (d h m s)
 * @param totalSeconds Number of seconds to format
 * @param includeLabel Whether to include "Processing:" label (default: false)
 * @returns Formatted time string
 */
export function formatTime(totalSeconds: number, includeLabel: boolean = false): string {
  // Validate input and handle edge cases
  if (typeof totalSeconds !== 'number' || isNaN(totalSeconds) || !isFinite(totalSeconds)) {
    return includeLabel ? "Processing: 0m 0s..." : "0m 0s";
  }
  
  // Ensure we're dealing with a positive number of seconds
  const seconds = Math.max(0, Math.floor(totalSeconds));
  
  // Calculate days, hours, minutes and remaining seconds
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  // Format the time string based on the duration
  let timeString = "";
  
  if (days > 0) {
    timeString += `${days}d `;
  }
  
  if (hours > 0 || days > 0) {
    timeString += `${hours}h `;
  }
  
  timeString += `${minutes}m ${remainingSeconds}s`;
  
  return includeLabel ? `Processing: ${timeString}...` : timeString;
}

/**
 * Create a completion message with time and device information
 * @param seconds Total processing time in seconds
 * @param deviceType Type of device used (CPU, GPU, Groq API, etc.)
 * @returns Formatted completion message
 */
export function formatCompletionTime(seconds: number, deviceType: string): string {
  // Ensure seconds is a valid number
  const validSeconds = typeof seconds === 'number' && !isNaN(seconds) && seconds > 0 ? seconds : 0;
  return `Processed in ${formatTime(validSeconds)} using ${deviceType}`;
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
 * Format the extraction completion time message
 * @param seconds Total extraction time in seconds
 * @param progress Optional progress percentage for real-time display
 * @returns Formatted extraction completion message
 */
export function formatExtractionCompletionTime(seconds: number, progress?: number): string {
  if (progress !== undefined) {
    // For real-time display during extraction
    return `Extracting for ${formatTime(seconds)}...`;
  }
  // For completed extraction
  return `Extracted in ${formatTime(seconds)}`;
}

/**
 * Converts a time string in "MM:SS" or "HH:MM:SS" format to seconds
 * @param timeString Time string to convert
 * @returns Number of seconds
 */
export function timeStringToSeconds(timeString: string): number | null {
  if (!timeString) return null;

  // Handle "HH:MM:SS" format
  const hhmmssMatch = timeString.match(/^(\d+):(\d+):(\d+)$/);
  if (hhmmssMatch) {
    const hours = parseInt(hhmmssMatch[1], 10);
    const minutes = parseInt(hhmmssMatch[2], 10);
    const seconds = parseInt(hhmmssMatch[3], 10);
    return (hours * 3600) + (minutes * 60) + seconds;
  }

  // Handle "MM:SS" format 
  const mmssMatch = timeString.match(/^(\d+):(\d+)$/);
  if (mmssMatch) {
    const minutes = parseInt(mmssMatch[1], 10);
    const seconds = parseInt(mmssMatch[2], 10);
    return (minutes * 60) + seconds;
  }

  return null;
}

/**
 * A utility class for managing process timers
 * Provides consistent time tracking across the application
 */
export class ProcessTimer {
  private startTime: number | null = null;
  private endTime: number | null = null;
  private pausedTime: number = 0;
  private isRunning: boolean = false;
  private timerInterval: NodeJS.Timeout | null = null;
  private updateCallback: (seconds: number) => void;

  /**
   * Creates a new process timer
   * @param updateCallback Function to call with elapsed time (in seconds)
   */
  constructor(updateCallback: (seconds: number) => void) {
    this.updateCallback = updateCallback;
  }

  /**
   * Start the timer
   * If the timer was paused, it will resume from that point
   */
  start(): void {
    if (!this.isRunning) {
      this.startTime = Date.now() - this.pausedTime;
      this.isRunning = true;
      this.timerInterval = setInterval(() => {
        this.updateCallback(this.getElapsedSeconds());
      }, 1000);
    }
  }

  /**
   * Stop the timer and return the total elapsed time
   * @returns Total elapsed time in seconds
   */
  stop(): number {
    if (this.isRunning) {
      this.endTime = Date.now();
      this.isRunning = false;
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
    }
    return this.getElapsedSeconds();
  }

  /**
   * Pause the timer but maintain the elapsed time
   */
  pause(): void {
    if (this.isRunning) {
      this.pausedTime = Date.now() - (this.startTime || 0);
      this.isRunning = false;
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
    }
  }

  /**
   * Reset the timer to zero
   */
  reset(): void {
    this.startTime = null;
    this.endTime = null;
    this.pausedTime = 0;
    this.isRunning = false;
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Get the current elapsed time in seconds
   * @returns Elapsed time in seconds
   */
  getElapsedSeconds(): number {
    if (!this.startTime) return 0;
    const endTimeValue = this.isRunning ? Date.now() : (this.endTime || Date.now());
    return Math.floor((endTimeValue - this.startTime) / 1000);
  }

  /**
   * Clean up the timer (clear intervals)
   * Should be called when component unmounts
   */
  cleanup(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Get the timer's running state
   * @returns True if the timer is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
} 