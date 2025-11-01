import { del } from '@vercel/blob';

/**
 * Service for managing Vercel Blob storage cleanup
 */
export class BlobCleanupService {
  /**
   * Delete multiple blob files by their URLs or filenames
   */
  static async deleteBlobs(urls: string[]): Promise<{
    deleted: string[];
    failed: string[];
  }> {
    const results = {
      deleted: [] as string[],
      failed: [] as string[]
    };

    if (!urls || urls.length === 0) {
      console.log('[BlobCleanup] No URLs provided for deletion');
      return results;
    }

    console.log(`[BlobCleanup] Attempting to delete ${urls.length} blob files`);

    for (const url of urls) {
      try {
        if (!url || typeof url !== 'string') {
          console.warn('[BlobCleanup] Invalid URL provided:', url);
          results.failed.push(url);
          continue;
        }

        // Extract the blob path from the full URL
        // Vercel Blob URLs look like: https://xyz.public.blob.vercel-storage.com/batch-audio/timestamp-filename.mp3
        const blobPath = this.extractBlobPath(url);
        
        if (!blobPath) {
          console.warn('[BlobCleanup] Could not extract blob path from URL:', url);
          results.failed.push(url);
          continue;
        }

        console.log(`[BlobCleanup] Attempting to delete blob: ${url}`);
        console.log(`[BlobCleanup] Extracted path: ${blobPath}`);
        
        // Delete the blob using the Vercel Blob API
        console.log(`[BlobCleanup] Calling del() function...`);
        const deleteResult = await del(url);
        console.log(`[BlobCleanup] del() returned:`, deleteResult);
        
        console.log(`[BlobCleanup] Successfully deleted blob: ${url}`);
        results.deleted.push(url);
        
      } catch (error) {
        console.error(`[BlobCleanup] Failed to delete blob ${url}:`, error);
        console.error(`[BlobCleanup] Error details:`, {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : undefined
        });
        results.failed.push(url);
      }
    }

    console.log(`[BlobCleanup] Cleanup completed: ${results.deleted.length} deleted, ${results.failed.length} failed`);
    return results;
  }

  /**
   * Extract the blob path from a full Vercel Blob URL or return the path if it's already a path
   */
  private static extractBlobPath(url: string): string | null {
    try {
      // If it's already a path (not a full URL), return it as-is
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return url;
      }
      
      // For Vercel Blob URLs, we can use the full URL directly with the del() function
      // But we'll extract a clean path for logging purposes
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      
      // Remove leading slash if present
      return pathname.startsWith('/') ? pathname.slice(1) : pathname;
    } catch (error) {
      console.error('[BlobCleanup] Error parsing URL:', error);
      return null;
    }
  }

  /**
   * Clean up blobs associated with a batch job
   */
  static async cleanupBatchJobBlobs(batchItems: Array<{ filename: string; original_filename: string }>): Promise<{
    deleted: string[];
    failed: string[];
  }> {
    console.log(`[BlobCleanup] Starting cleanup for batch job with ${batchItems.length} items`);
    console.log('[BlobCleanup] Raw items received:', JSON.stringify(batchItems, null, 2));
    console.log('[BlobCleanup] Items to process:', batchItems.map(item => ({ 
      filename: item.filename, 
      original_filename: item.original_filename,
      hasFilename: !!item.filename,
      filenameType: typeof item.filename
    })));

    // Extract blob URLs from batch items
    // The filename field should contain the Vercel Blob filename/path
    const blobUrls: string[] = [];
    
    for (const item of batchItems) {
      try {
        console.log(`[BlobCleanup] Processing item with filename: "${item.filename}"`);
        
        // If the filename looks like a full URL, use it directly
        if (item.filename.startsWith('https://')) {
          console.log(`[BlobCleanup] Found blob URL: ${item.filename}`);
          blobUrls.push(item.filename);
        } else if (item.filename.startsWith('batch-audio/')) {
          // Handle case where only the path is stored instead of full URL
          // We need to pass the path directly to del() function, which should work
          console.log(`[BlobCleanup] Found blob path (will use del() with path): ${item.filename}`);
          blobUrls.push(item.filename);
        } else {
          // If it's just a filename/path, we need to construct the URL
          // Note: This approach assumes we can reconstruct the URL
          // In practice, we should store the full URL in the database
          console.warn('[BlobCleanup] Filename is not a full URL, attempting cleanup anyway:', item.filename);
          
          // Try to delete by filename anyway - Vercel Blob might handle it
          blobUrls.push(item.filename);
        }
      } catch (error) {
        console.error('[BlobCleanup] Error processing batch item:', error, item);
      }
    }

    console.log(`[BlobCleanup] Found ${blobUrls.length} blob URLs to delete:`, blobUrls);

    if (blobUrls.length === 0) {
      console.log('[BlobCleanup] No blob URLs found for cleanup');
      return { deleted: [], failed: [] };
    }

    return await this.deleteBlobs(blobUrls);
  }

  /**
   * Clean up old blobs based on age (for maintenance)
   */
  static async cleanupOldBlobs(maxAgeHours: number = 72): Promise<void> {
    // This would require listing blobs and checking their creation time
    // For now, we'll just log the intention
    console.log(`[BlobCleanup] Old blob cleanup requested for blobs older than ${maxAgeHours} hours`);
    console.log('[BlobCleanup] Automatic old blob cleanup not yet implemented - manual cleanup required');
    
    // TODO: Implement automatic cleanup of old blobs
    // This would require:
    // 1. Listing all blobs in the storage
    // 2. Checking their creation timestamps
    // 3. Deleting blobs older than the specified age
    // 4. Being careful not to delete blobs that are still referenced by active jobs
  }
}

export default BlobCleanupService;