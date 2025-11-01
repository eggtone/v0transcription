import { NextRequest, NextResponse } from 'next/server';
import logger from '@server/lib/logger';
import { batchJobQueries, batchItemQueries } from '@server/database';
import BlobCleanupService from '@server/services/blob-cleanup-service';

export async function DELETE(
  request: NextRequest, 
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const handlerLogger = logger.child({ jobId, route: '/api/batch/[jobId]/delete' });

  handlerLogger.info('[BatchDelete] Delete request received');

  try {
    if (!jobId || typeof jobId !== 'string') {
      handlerLogger.warn('[BatchDelete] Invalid job ID provided');
      return NextResponse.json(
        { error: 'Valid job ID is required' },
        { status: 400 }
      );
    }

    // Check if job exists
    const job = batchJobQueries.findById.get(jobId);
    if (!job) {
      handlerLogger.warn('[BatchDelete] Job not found');
      return NextResponse.json(
        { error: `Batch job ${jobId} not found` },
        { status: 404 }
      );
    }

    // Only allow deletion of completed, failed, or expired jobs
    if (!['completed', 'failed', 'expired'].includes(job.status)) {
      handlerLogger.warn('[BatchDelete] Cannot delete active job', { status: job.status });
      return NextResponse.json(
        { error: `Cannot delete job with status: ${job.status}. Only completed, failed, or expired jobs can be deleted.` },
        { status: 400 }
      );
    }

    // Get related items before deletion for blob cleanup
    const items = batchItemQueries.findByBatchId.all(jobId);
    handlerLogger.info('[BatchDelete] Found items to delete', { 
      itemCount: items.length,
      items: items.map(item => ({
        id: item.id,
        filename: item.filename,
        original_filename: item.original_filename,
        status: item.status
      }))
    });

    // Clean up associated blob files before deleting database records
    if (items.length > 0) {
      handlerLogger.info('[BatchDelete] Starting blob cleanup');
      try {
        const cleanupResult = await BlobCleanupService.cleanupBatchJobBlobs(items);
        handlerLogger.info('[BatchDelete] Blob cleanup completed', {
          deleted: cleanupResult.deleted.length,
          failed: cleanupResult.failed.length
        });
        
        if (cleanupResult.failed.length > 0) {
          handlerLogger.warn('[BatchDelete] Some blobs failed to delete', {
            failedUrls: cleanupResult.failed
          });
        }
      } catch (error) {
        handlerLogger.error('[BatchDelete] Blob cleanup failed', { error });
        // Continue with database deletion even if blob cleanup fails
      }
    }

    // Delete the job (CASCADE will delete related items)
    batchJobQueries.delete.run(jobId);
    handlerLogger.info('[BatchDelete] Job deleted successfully');

    return NextResponse.json({
      success: true,
      jobId,
      message: 'Batch job deleted successfully',
      deletedItems: items.length
    });

  } catch (error) {
    handlerLogger.error({ error }, '[BatchDelete] Error deleting batch job');
    
    return NextResponse.json(
      { error: `Failed to delete batch job: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}