/**
 * Utility to test YouTube audio extraction with different quality settings
 */
import { MP3Quality, MP3QualityLabels } from './audio-utils';

interface QualityTestResult {
  quality: MP3Quality;
  qualityLabel: string;
  fileSize: number;
  fileSizeMB: number;
  success: boolean;
  error?: string;
  title?: string;
  duration?: string;
}

/**
 * Test YouTube audio extraction with different quality settings
 * @param youtubeUrl The YouTube URL to test
 * @returns Promise with test results for each quality setting
 */
export async function testYouTubeQualitySettings(
  youtubeUrl: string
): Promise<QualityTestResult[]> {
  // Define quality settings to test
  const qualitiesToTest: MP3Quality[] = [
    MP3Quality.HIGH,
    MP3Quality.KBPS_192,
    MP3Quality.KBPS_128,
    MP3Quality.LOW,
    MP3Quality.KBPS_64,
    MP3Quality.KBPS_32
  ];
  
  const results: QualityTestResult[] = [];
  
  // Test each quality setting
  for (const quality of qualitiesToTest) {
    console.log(`Testing quality: ${MP3QualityLabels[quality]} (${quality})`);
    
    try {
      // Call API to extract YouTube audio with specific quality
      const response = await fetch("/api/youtube/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          url: youtubeUrl,
          quality 
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to extract YouTube audio");
      }
      
      const result = await response.json();
      
      // Download the audio file to get actual size
      const audioResponse = await fetch(result.audioUrl);
      const blob = await audioResponse.blob();
      const fileSize = blob.size;
      const fileSizeMB = fileSize / (1024 * 1024);
      
      results.push({
        quality,
        qualityLabel: MP3QualityLabels[quality],
        fileSize,
        fileSizeMB,
        success: true,
        title: result.title,
        duration: result.duration
      });
      
      console.log(`Quality ${MP3QualityLabels[quality]}: ${fileSize} bytes (${fileSizeMB.toFixed(2)} MB)`);
      
    } catch (error) {
      console.error(`Error testing quality ${MP3QualityLabels[quality]}:`, error);
      
      results.push({
        quality,
        qualityLabel: MP3QualityLabels[quality],
        fileSize: 0,
        fileSizeMB: 0,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
  
  return results;
}

/**
 * Format quality test results as a table for display
 */
export function formatQualityTestResults(results: QualityTestResult[]): string {
  // Sort results by quality 
  const sortedResults = [...results].sort((a, b) => a.quality - b.quality);
  
  // Create table header
  let table = "| Quality | File Size | Success |\n";
  table += "|---------|-----------|--------|\n";
  
  // Add rows for each result
  for (const result of sortedResults) {
    const sizeText = result.success 
      ? `${result.fileSizeMB.toFixed(2)} MB`
      : "N/A";
    
    const successText = result.success ? "✓" : "✗";
    
    table += `| ${result.qualityLabel} | ${sizeText} | ${successText} |\n`;
  }
  
  return table;
} 