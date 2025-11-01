import { NextRequest, NextResponse } from 'next/server';
import { batchItemQueries, batchJobQueries } from '@/lib/database';
import { del } from '@vercel/blob';
import logger from '@/utils/logger';
import GroqBatchService, { BatchSubmissionItem } from '@/services/groq-batch-service';

export async function POST(
  request: NextRequest, 
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const handlerLogger = logger.child({ jobId, route: '/api/batch/[jobId]/retry' });

  try {
    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json(
        { error: 'Valid job ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { model, completionWindow = '24h', itemIds } = body;

    // Get the original batch job to copy settings
    const originalJob = batchJobQueries.findById.get(jobId);
    if (!originalJob) {
      return NextResponse.json(
        { error: 'Original batch job not found' },
        { status: 404 }
      );
    }

    // Get all items for this batch job
    const allItems = batchItemQueries.findByBatchId.all(jobId);
    
    // Determine which items to retry
    let itemsToRetry;
    if (itemIds && Array.isArray(itemIds)) {
      // Retry specific items by ID
      itemsToRetry = allItems.filter(item => itemIds.includes(item.id));
    } else {
      // Retry all failed items, including pending items from completed jobs
      const isCompletedJob = originalJob.status === 'completed';
      itemsToRetry = allItems.filter(item => 
        item.status === 'failed' || (isCompletedJob && item.status === 'pending')
      );
    }

    if (itemsToRetry.length === 0) {
      return NextResponse.json(
        { error: 'No failed or pending items found to retry' },
        { status: 400 }
      );
    }

    handlerLogger.info('[BatchRetry] Starting retry process', {
      originalJobId: jobId,
      itemsToRetry: itemsToRetry.length,
      model: model || originalJob.model
    });

    // Check if the items have blob URLs (needed for reprocessing)
    const itemsWithBlobs = itemsToRetry.filter(item => 
      item.filename && item.filename.startsWith('https://')
    );

    if (itemsWithBlobs.length === 0) {
      return NextResponse.json(
        { error: 'No blob URLs found for failed items. Original files may have been cleaned up.' },
        { status: 400 }
      );
    }

    // Download the blob files and create new batch submission items
    const batchItems: BatchSubmissionItem[] = [];
    const downloadedBlobs: string[] = []; // Track for cleanup if needed

    for (const item of itemsWithBlobs) {
      try {
        handlerLogger.info('[BatchRetry] Downloading blob for retry', {
          itemId: item.id,
          filename: item.original_filename,
          blobUrl: item.filename
        });

        // Download the blob
        const response = await fetch(item.filename);
        if (!response.ok) {
          throw new Error(`Failed to download blob: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        batchItems.push({
          filename: `retry_${Date.now()}_${item.original_filename}`,
          originalFilename: item.original_filename,
          audioBuffer: buffer,
          model: model || originalJob.model
        });

        downloadedBlobs.push(item.filename);
      } catch (error) {
        handlerLogger.warn('[BatchRetry] Failed to download blob for item', {
          itemId: item.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (batchItems.length === 0) {
      return NextResponse.json(
        { error: 'Failed to download any blob files for retry' },
        { status: 500 }
      );
    }

    // Submit new batch job
    const batchService = new GroqBatchService();
    const newJobId = await batchService.submitBatch(batchItems, {
      model: model || originalJob.model,
      completionWindow: completionWindow as '24h' | '7d',
      metadata: {
        retryOf: jobId,
        originalJobId: jobId,
        retriedItems: itemsToRetry.length,
        submittedBy: 'retry-api',
        retryTimestamp: new Date().toISOString()
      }
    });

    handlerLogger.info('[BatchRetry] New batch job created', {
      originalJobId: jobId,
      newJobId,
      retriedItems: batchItems.length
    });

    // Update the original failed items to indicate they've been retried
    for (const item of itemsToRetry) {
      try {
        // Add retry information to the error message
        const retryMessage = `Retried in batch job: ${newJobId}`;
        const updatedErrorMessage = item.error_message 
          ? `${item.error_message} | ${retryMessage}`
          : retryMessage;

        batchItemQueries.updateStatus.run(
          'failed', // Keep status as failed
          'failed',
          null,
          updatedErrorMessage,
          item.id
        );
      } catch (error) {
        handlerLogger.warn('[BatchRetry] Failed to update retry status for item', {
          itemId: item.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return NextResponse.json({
      success: true,
      originalJobId: jobId,
      newJobId,
      retriedItems: batchItems.length,
      totalFailedItems: itemsToRetry.length,
      message: `Created new batch job ${newJobId} with ${batchItems.length} retried items`
    });

  } catch (error) {
    handlerLogger.error('[BatchRetry] Error during retry process', { error });
    return NextResponse.json(
      { error: `Retry failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}