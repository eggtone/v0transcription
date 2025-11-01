import { NextRequest, NextResponse } from 'next/server';
import { batchItemQueries, batchJobQueries } from '@server/database';
import logger from '@server/lib/logger';

export async function GET(
  request: NextRequest, 
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const handlerLogger = logger.child({ jobId, route: '/api/batch/[jobId]/failed-items' });

  try {
    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json(
        { error: 'Valid job ID is required' },
        { status: 400 }
      );
    }

    // Get the batch job to check its status
    const batchJob = batchJobQueries.findById.get(jobId) as any;
    if (!batchJob) {
      return NextResponse.json(
        { error: 'Batch job not found' },
        { status: 404 }
      );
    }

    // Get all items for this batch job
    const allItems = batchItemQueries.findByBatchId.all(jobId) as any[];
    
    if (allItems.length === 0) {
      return NextResponse.json(
        { error: 'No items found for this batch job' },
        { status: 404 }
      );
    }

    // Filter for failed and pending items (pending items from completed jobs are effectively failed)
    const isCompletedJob = batchJob.status === 'completed';
    const failedItems = allItems.filter((item: any) =>
      item.status === 'failed' || (isCompletedJob && item.status === 'pending')
    );
    
    handlerLogger.info('[FailedItems] Retrieved failed items', { 
      totalItems: allItems.length,
      failedItems: failedItems.length 
    });

    // Return detailed information about failed items
    const failedItemsDetails = failedItems.map((item: any) => ({
      id: item.id,
      custom_id: item.custom_id,
      filename: item.filename,
      original_filename: item.original_filename,
      file_size: item.file_size,
      status: item.status,
      error_message: item.error_message,
      created_at: item.created_at,
      completed_at: item.completed_at
    }));

    // Also get summary statistics
    const summary = {
      total: allItems.length,
      completed: allItems.filter((item: any) => item.status === 'completed').length,
      failed: failedItems.length,
      pending: allItems.filter((item: any) => item.status === 'pending').length,
      processing: allItems.filter((item: any) => item.status === 'processing').length
    };

    return NextResponse.json({
      success: true,
      jobId,
      summary,
      failedItems: failedItemsDetails
    });

  } catch (error) {
    handlerLogger.error('[FailedItems] Error retrieving failed items', { error });
    return NextResponse.json(
      { error: 'Failed to retrieve failed items' },
      { status: 500 }
    );
  }
}