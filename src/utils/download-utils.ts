import { EnhancedQueuedAudioItem } from "@/store/batchQueueStore";
import { formatTime } from "./time-utils";

/**
 * Triggers a browser download for the given content.
 * @param content The content to download (string or Blob).
 * @param filename The desired filename for the download.
 * @param mimeType The MIME type of the content.
 */
export function triggerBrowserDownload(
  content: string | Blob,
  filename: string,
  mimeType: string
): void {
  const blob =
    content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates a CSV string containing metadata for the audio queue items.
 * @param items An array of audio queue items.
 * @returns A string containing the CSV data.
 */
export function generateMetadataCsv(
  items: EnhancedQueuedAudioItem[]
): string {
  // Create the header row
  const header = "id,name,duration,url";
  
  // Create the data rows
  const rows = items.map((item, index) => {
    // Use 1-based index for id
    const id = index + 1;
    
    // Remove file extension from name
    const name = item.name.replace(/\.[^/.]+$/, "");

    // Format duration - ensure we have a number value or proper message
    let duration;
    if (item.duration !== undefined && item.duration !== null && !isNaN(item.duration)) {
      duration = formatTime(item.duration);
    } else {
      duration = "N/A";  // Default value for unknown duration
    }

    // Determine the URL: original YouTube URL or original file name for local files
    let sourceUrl = "N/A";
    if (item.source === "youtube-video" || item.source === "youtube-playlist") {
        // Clean potential playlist parameters from YouTube URLs
        if (item.url) {
            const urlObj = new URL(item.url);
            urlObj.searchParams.delete('list');
            urlObj.searchParams.delete('index');
            sourceUrl = urlObj.toString();
        }
    } else if (item.source === "local") {
      if (item.file) {
        // For local files, use the original filename with path if available
        sourceUrl = item.file.name;
      } else if (item.name) {
        // Fallback to item name if file object is not available
        sourceUrl = item.name;
      }
    } else if (item.url && item.url.startsWith('blob:')) {
      // Fallback for local files if item.file is somehow missing but blob url exists
      sourceUrl = item.name; 
    } else if (item.url) {
      // Catch-all for other URL types if they exist
      sourceUrl = item.url;
    }

    // Basic CSV escaping (wrapping fields with quotes if they contain commas or quotes)
    const escapeCsvField = (field: string | number): string => {
      const str = String(field);
      if (str.includes(",") || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Format and return the row
    return [
      escapeCsvField(id),
      escapeCsvField(name),
      escapeCsvField(duration),
      escapeCsvField(sourceUrl),
    ].join(",");
  });

  // Join all rows with proper newlines
  return [header, ...rows].join("\n");
} 